import { HexKey } from "@snort/nostr";
import { useSelector } from "react-redux";
import { RootState } from "State/Store";
import { randomSample } from "Util";
import { v1 } from "uuid";

export type RelayPicker = ReturnType<typeof useRelaysForFollows>;

export default function useRelaysForFollows() {
  const { followsRelays, relays } = useSelector((s: RootState) => s.login);

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

  return {
    bestWriteRelay: bestRelays,
    pickRelays: (keys: Array<HexKey>) => {
      const allBest = keys.map(a => {
        return { key: a, relays: writeRelays(a) };
      });
      const missing = allBest.filter(a => a.relays === undefined);
      const hasRelays = allBest.filter(a => a.relays !== undefined);
      const relayUserMap = hasRelays.reduce((acc, v) => {
        for (const r of v.relays!) {
          if (!acc.has(r.url)) {
            acc.set(r.url, new Set([v.key]));
          } else {
            acc.get(r.url)!.add(v.key);
          }
        }
        return acc;
      }, new Map<string, Set<HexKey>>());
      const topRelays = [...relayUserMap.entries()].sort(([, v], [, v1]) => v1.size - v.size);

      // <relay, key[]>
      // <key, relay[]> - pick n relays

      console.debug("Missing relay lists for: ", missing);
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
      console.debug("Picked relays: ", userKeyMap);

      return userKeyMap;
    },
  };
}
