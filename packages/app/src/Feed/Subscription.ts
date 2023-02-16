import { useEffect, useMemo, useReducer, useState } from "react";
import { TaggedRawEvent } from "@snort/nostr";
import { System, Subscriptions } from "@snort/nostr";
import { debounce, unwrap } from "Util";
import { db } from "Db";

export type NoteStore = {
  notes: Array<TaggedRawEvent>;
  end: boolean;
};

export type UseSubscriptionOptions = {
  leaveOpen: boolean;
  cache: boolean;
};

interface ReducerArg {
  type: "END" | "EVENT" | "CLEAR";
  ev?: TaggedRawEvent | TaggedRawEvent[];
  end?: boolean;
}

function notesReducer(state: NoteStore, arg: ReducerArg) {
  if (arg.type === "END") {
    return {
      notes: state.notes,
      end: arg.end ?? true,
    } as NoteStore;
  }

  if (arg.type === "CLEAR") {
    return {
      notes: [],
      end: state.end,
    } as NoteStore;
  }

  let evs = arg.ev;
  if (!(evs instanceof Array)) {
    evs = evs === undefined ? [] : [evs];
  }
  const existingIds = new Set(state.notes.map(a => a.id));
  evs = evs.filter(a => !existingIds.has(a.id));
  if (evs.length === 0) {
    return state;
  }
  return {
    notes: [...state.notes, ...evs],
  } as NoteStore;
}

const initStore: NoteStore = {
  notes: [],
  end: false,
};

export interface UseSubscriptionState {
  store: NoteStore;
  clear: () => void;
  append: (notes: TaggedRawEvent[]) => void;
}

/**
 * Wait time before returning changed state
 */
const DebounceMs = 200;

/**
 *
 * @param {Subscriptions} sub
 * @param {any} opt
 * @returns
 */
export default function useSubscription(
  sub: Subscriptions | Array<Subscriptions> | null,
  options?: UseSubscriptionOptions
): UseSubscriptionState {
  const [state, dispatch] = useReducer(notesReducer, initStore);
  const [debounceOutput, setDebounceOutput] = useState<number>(0);
  const [subDebounce, setSubDebounced] = useState<Subscriptions | Array<Subscriptions>>();
  const useCache = useMemo(() => options?.cache === true, [options]);

  useEffect(() => {
    if (sub) {
      return debounce(DebounceMs, () => {
        setSubDebounced(sub);
      });
    }
  }, [sub, options]);

  useEffect(() => {
    if (subDebounce) {
      dispatch({
        type: "END",
        end: false,
      });

      const subs = Array.isArray(subDebounce) ? subDebounce : [subDebounce];
      for (const s of subs) {
        if (useCache) {
          // preload notes from db
          PreloadNotes(s.Id)
            .then(ev => {
              dispatch({
                type: "EVENT",
                ev: ev,
              });
            })
            .catch(console.warn);
        }
        s.OnEvent = e => {
          dispatch({
            type: "EVENT",
            ev: e,
          });
          if (useCache) {
            db.events.put(e);
          }
        };

        s.OnEnd = c => {
          if (!(options?.leaveOpen ?? false)) {
            c.RemoveSubscription(s.Id);
            if (s.IsFinished()) {
              System.RemoveSubscription(s.Id);
            }
          }
          dispatch({
            type: "END",
            end: true,
          });
        };

        console.debug("Adding sub: ", s);
        System.AddSubscription(s);
      }
      return () => {
        for (const s of subs) {
          console.debug("Removing sub: ", s);
          s.OnEvent = () => undefined;
          System.RemoveSubscription(s.Id);
        }
      };
    }
  }, [subDebounce, useCache]);

  useEffect(() => {
    if (subDebounce && useCache) {
      return debounce(500, () => {
        for (const s of Array.isArray(subDebounce) ? subDebounce : [subDebounce]) {
          TrackNotesInFeed(s.Id, state.notes).catch(console.warn);
        }
      });
    }
  }, [state, useCache]);

  useEffect(() => {
    return debounce(DebounceMs, () => {
      setDebounceOutput(s => (s += 1));
    });
  }, [state]);

  const stateDebounced = useMemo(() => state, [debounceOutput]);
  return {
    store: stateDebounced,
    clear: () => {
      dispatch({ type: "CLEAR" });
    },
    append: (n: TaggedRawEvent[]) => {
      dispatch({
        type: "EVENT",
        ev: n,
      });
    },
  };
}

/**
 * Lookup cached copy of feed
 */
const PreloadNotes = async (id: string): Promise<TaggedRawEvent[]> => {
  const feed = await db.feeds.get(id);
  if (feed) {
    const events = await db.events.bulkGet(feed.ids);
    return events.filter(a => a !== undefined).map(a => unwrap(a));
  }
  return [];
};

const TrackNotesInFeed = async (id: string, notes: TaggedRawEvent[]) => {
  const existing = await db.feeds.get(id);
  const ids = Array.from(new Set([...(existing?.ids || []), ...notes.map(a => a.id)]));
  const since = notes.reduce((acc, v) => (acc > v.created_at ? v.created_at : acc), +Infinity);
  const until = notes.reduce((acc, v) => (acc < v.created_at ? v.created_at : acc), -Infinity);
  await db.feeds.put({ id, ids, since, until });
};
