import { HexKey } from "@snort/nostr";
import { useMemo } from "react";
import { useSelector } from "react-redux";
import { RootState } from "State/Store";
import { randomSample, unwrap } from "Util";

export type RelayPicker = ReturnType<typeof useRelaysForFollows>;

export default function useRelaysForFollows() {
  const { followsRelays } = useSelector((s: RootState) => s.login);

  function writeRelays(key: HexKey) {
    if (followsRelays[key]) {
      const relays = followsRelays[key];
      return relays.filter(a => a.settings.write);
    }
  }

  function bestRelays(key: HexKey) {
    if (followsRelays[key]) {
      const relays = followsRelays[key];
      const writeRelays = relays.filter(a => a.settings.write);
      return randomSample(writeRelays, 1)[0];
    }
  }

  return useMemo(() => {
    return {
      bestWriteRelay: bestRelays,
      pickRelays: (keys: Array<HexKey>) => {
        const allBest = keys.map(a => {
          return { key: a, relays: writeRelays(a) };
        });
        //const missing = allBest.filter(a => a.relays === undefined);
        const hasRelays = allBest.filter(a => a.relays !== undefined);
        const relayUserMap = hasRelays.reduce((acc, v) => {
          for (const r of unwrap(v.relays)) {
            if (!acc.has(r.url)) {
              acc.set(r.url, new Set([v.key]));
            } else {
              unwrap(acc.get(r.url)).add(v.key);
            }
          }
          return acc;
        }, new Map<string, Set<HexKey>>());
        const topRelays = [...relayUserMap.entries()].sort(([, v], [, v1]) => v1.size - v.size);

        // <relay, key[]> - count keys per relay
        // <key, relay[]> - pick n top relays
        // <relay, key[]> - map keys per relay (for subscription filter)

        const userKeyMap: Record<HexKey, Array<string>> = Object.fromEntries(
          keys.map(k => {
            // pick top 3 relays for this key
            const relaysForKey = topRelays
              .filter(([, v]) => v.has(k))
              .slice(0, 3)
              .map(([k]) => k);
            return [k, relaysForKey];
          })
        );

        const pickedRelays = new Set([...Object.values(userKeyMap).flat()]);

        return Object.fromEntries([...pickedRelays].map(a => [a, relayUserMap.get(a)]));
      },
    };
  }, [followsRelays]);
}
