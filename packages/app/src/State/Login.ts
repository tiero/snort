import { AnyAction, createSlice, PayloadAction, ThunkAction } from "@reduxjs/toolkit";
import * as secp from "@noble/secp256k1";
import { DefaultRelays } from "Const";
import { FullRelaySettings, HexKey, TaggedRawEvent } from "@snort/nostr";
import { RelaySettings } from "@snort/nostr";
import type { AppDispatch, RootState } from "State/Store";
import { ImgProxySettings } from "Hooks/useImgProxy";

const PrivateKeyItem = "secret";
const PublicKeyItem = "pubkey";
const NotificationsReadItem = "notifications-read";
const UserPreferencesKey = "preferences";
const RelayListKey = "last-relays";
const FollowList = "last-follows";

export interface NotificationRequest {
  title: string;
  body: string;
  icon: string;
  timestamp: number;
}

export interface UserPreferences {
  /**
   * Enable reactions / reposts / zaps
   */
  enableReactions: boolean;

  /**
   * Reaction emoji
   */
  reactionEmoji: string;

  /**
   * Automatically load media (show link only) (bandwidth/privacy)
   */
  autoLoadMedia: "none" | "follows-only" | "all";

  /**
   * Select between light/dark theme
   */
  theme: "system" | "light" | "dark";

  /**
   * Ask for confirmation when reposting notes
   */
  confirmReposts: boolean;

  /**
   * Automatically show the latests notes
   */
  autoShowLatest: boolean;

  /**
   * Show debugging menus to help diagnose issues
   */
  showDebugMenus: boolean;

  /**
   * File uploading service to upload attachments to
   */
  fileUploader: "void.cat" | "nostr.build" | "nostrimg.com";

  /**
   * Use imgproxy to optimize images
   */
  imgProxyConfig: ImgProxySettings | null;

  /**
   * Default page to select on load
   */
  defaultRootTab: "posts" | "conversations" | "global";
}

export type DbType = "indexdDb" | "redux";

export interface LoginStore {
  /**
   * Which db we will use to cache data
   */
  useDb: DbType;

  /**
   * If there is no login
   */
  loggedOut?: boolean;

  /**
   * Current user private key
   */
  privateKey?: HexKey;

  /**
   * Current users public key
   */
  publicKey?: HexKey;

  /**
   * If user generated key on snort
   */
  newUserKey: boolean;

  /**
   * All the logged in users relays
   */
  relays: Record<string, RelaySettings>;

  /**
   * Newest relay list timestamp
   */
  latestRelays: number;

  /**
   * A list of pubkeys this user follows
   */
  follows: HexKey[];

  /**
   * Newest relay list timestamp
   */
  latestFollows: number;

  /**
   * A list of tags this user follows
   */
  tags: string[];

  /**
   * Newest tag list timestamp
   */
  latestTags: number;

  /**
   * A list of event ids this user has pinned
   */
  pinned: HexKey[];

  /**
   * Last seen pinned list event timestamp
   */
  latestPinned: number;

  /**
   * A list of event ids this user has bookmarked
   */
  bookmarked: HexKey[];

  /**
   * Last seen bookmark list event timestamp
   */
  latestBookmarked: number;

  /**
   * A list of pubkeys this user has muted
   */
  muted: HexKey[];

  /**
   * Last seen mute list event timestamp
   */
  latestMuted: number;

  /**
   * A list of pubkeys this user has muted privately
   */
  blocked: HexKey[];

  /**
   * Latest notification
   */
  latestNotification: number;

  /**
   * Timestamp of last read notification
   */
  readNotifications: number;

  /**
   * Encrypted DM's
   */
  dms: TaggedRawEvent[];

  /**
   * Counter to trigger refresh of unread dms
   */
  dmInteraction: 0;

  /**
   * Users cusom preferences
   */
  preferences: UserPreferences;

  /**
   * Relays which follows are writing and reading to
   */
  followsRelays: Record<HexKey, FullRelaySettings[]>;
}

export const DefaultImgProxy = {
  url: "https://imgproxy.snort.social",
  key: "a82fcf26aa0ccb55dfc6b4bd6a1c90744d3be0f38429f21a8828b43449ce7cebe6bdc2b09a827311bef37b18ce35cb1e6b1c60387a254541afa9e5b4264ae942",
  salt: "a897770d9abf163de055e9617891214e75a9016d748f8ef865e6ffbcb9ed932295659549773a22a019a5f06d0b440c320be411e3fddfe784e199e4f03d74bd9b",
};

export const InitState = {
  useDb: "redux",
  loggedOut: undefined,
  publicKey: undefined,
  privateKey: undefined,
  newUserKey: false,
  relays: {},
  latestRelays: 0,
  follows: [],
  latestFollows: 0,
  tags: [],
  latestTags: 0,
  pinned: [],
  latestPinned: 0,
  bookmarked: [],
  latestBookmarked: 0,
  muted: [],
  blocked: [],
  latestMuted: 0,
  latestNotification: 0,
  readNotifications: new Date().getTime(),
  dms: [],
  dmInteraction: 0,
  preferences: {
    enableReactions: true,
    reactionEmoji: "+",
    autoLoadMedia: "follows-only",
    theme: "system",
    confirmReposts: false,
    showDebugMenus: false,
    autoShowLatest: false,
    fileUploader: "void.cat",
    imgProxyConfig: DefaultImgProxy,
    defaultRootTab: "posts",
  },
  followsRelays: {},
} as LoginStore;

export interface SetRelaysPayload {
  relays: Record<string, RelaySettings>;
  createdAt: number;
}

export interface SetFollowsPayload {
  keys: HexKey[];
  createdAt: number;
}

const LoginSlice = createSlice({
  name: "Login",
  initialState: InitState,
  reducers: {
    init: (state, action: PayloadAction<DbType>) => {
      state.useDb = action.payload;
      state.privateKey = window.localStorage.getItem(PrivateKeyItem) ?? undefined;
      if (state.privateKey) {
        window.localStorage.removeItem(PublicKeyItem); // reset nip07 if using private key
        state.publicKey = secp.utils.bytesToHex(secp.schnorr.getPublicKey(state.privateKey));
        state.loggedOut = false;
      } else {
        state.loggedOut = true;
      }

      // check pub key only
      const pubKey = window.localStorage.getItem(PublicKeyItem);
      if (pubKey && !state.privateKey) {
        state.publicKey = pubKey;
        state.loggedOut = false;
      }

      const lastRelayList = window.localStorage.getItem(RelayListKey);
      if (lastRelayList) {
        state.relays = JSON.parse(lastRelayList);
      } else {
        state.relays = Object.fromEntries(DefaultRelays.entries());
      }

      const lastFollows = window.localStorage.getItem(FollowList);
      if (lastFollows) {
        state.follows = JSON.parse(lastFollows);
      }

      // notifications
      const readNotif = parseInt(window.localStorage.getItem(NotificationsReadItem) ?? "0");
      if (!isNaN(readNotif)) {
        state.readNotifications = readNotif;
      }

      // preferences
      const pref = window.localStorage.getItem(UserPreferencesKey);
      if (pref) {
        state.preferences = JSON.parse(pref);
      }

      // disable reactions for logged out
      if (state.loggedOut === true) {
        state.preferences.enableReactions = false;
      }
    },
    setPrivateKey: (state, action: PayloadAction<HexKey>) => {
      state.loggedOut = false;
      state.privateKey = action.payload;
      window.localStorage.setItem(PrivateKeyItem, action.payload);
      state.publicKey = secp.utils.bytesToHex(secp.schnorr.getPublicKey(action.payload));
    },
    setGeneratedPrivateKey: (state, action: PayloadAction<HexKey>) => {
      state.loggedOut = false;
      state.newUserKey = true;
      state.privateKey = action.payload;
      window.localStorage.setItem(PrivateKeyItem, action.payload);
      state.publicKey = secp.utils.bytesToHex(secp.schnorr.getPublicKey(action.payload));
    },
    setPublicKey: (state, action: PayloadAction<HexKey>) => {
      window.localStorage.setItem(PublicKeyItem, action.payload);
      state.loggedOut = false;
      state.publicKey = action.payload;
    },
    setRelays: (state, action: PayloadAction<SetRelaysPayload>) => {
      const relays = action.payload.relays;
      const createdAt = action.payload.createdAt;
      if (state.latestRelays > createdAt) {
        return;
      }

      // filter out non-websocket urls
      const filtered = new Map<string, RelaySettings>();
      for (const [k, v] of Object.entries(relays)) {
        if (k.startsWith("wss://") || k.startsWith("ws://")) {
          filtered.set(k, v as RelaySettings);
        }
      }

      state.relays = Object.fromEntries(filtered.entries());
      state.latestRelays = createdAt;
      window.localStorage.setItem(RelayListKey, JSON.stringify(state.relays));
    },
    removeRelay: (state, action: PayloadAction<string>) => {
      delete state.relays[action.payload];
      state.relays = { ...state.relays };
      window.localStorage.setItem(RelayListKey, JSON.stringify(state.relays));
    },
    setFollows: (state, action: PayloadAction<SetFollowsPayload>) => {
      const { keys, createdAt } = action.payload;
      if (state.latestFollows > createdAt) {
        return;
      }

      const existing = new Set(state.follows);
      const update = Array.isArray(keys) ? keys : [keys];

      let changes = false;
      for (const pk of update.filter(a => a.length === 64)) {
        if (!existing.has(pk)) {
          existing.add(pk);
          changes = true;
        }
      }
      for (const pk of existing) {
        if (!update.includes(pk)) {
          existing.delete(pk);
          changes = true;
        }
      }

      if (changes) {
        state.follows = Array.from(existing);
        state.latestFollows = createdAt;
      }

      window.localStorage.setItem(FollowList, JSON.stringify(state.follows));
    },
    setTags(state, action: PayloadAction<{ createdAt: number; tags: string[] }>) {
      const { createdAt, tags } = action.payload;
      if (createdAt >= state.latestTags) {
        const newTags = new Set([...tags]);
        state.tags = Array.from(newTags);
        state.latestTags = createdAt;
      }
    },
    setMuted(state, action: PayloadAction<{ createdAt: number; keys: HexKey[] }>) {
      const { createdAt, keys } = action.payload;
      if (createdAt >= state.latestMuted) {
        const muted = new Set([...keys]);
        state.muted = Array.from(muted);
        state.latestMuted = createdAt;
      }
    },
    setPinned(state, action: PayloadAction<{ createdAt: number; keys: HexKey[] }>) {
      const { createdAt, keys } = action.payload;
      if (createdAt >= state.latestPinned) {
        const pinned = new Set([...keys]);
        state.pinned = Array.from(pinned);
        state.latestPinned = createdAt;
      }
    },
    setBookmarked(state, action: PayloadAction<{ createdAt: number; keys: HexKey[] }>) {
      const { createdAt, keys } = action.payload;
      if (createdAt >= state.latestBookmarked) {
        const bookmarked = new Set([...keys]);
        state.bookmarked = Array.from(bookmarked);
        state.latestBookmarked = createdAt;
      }
    },
    setBlocked(state, action: PayloadAction<{ createdAt: number; keys: HexKey[] }>) {
      const { createdAt, keys } = action.payload;
      if (createdAt >= state.latestMuted) {
        const blocked = new Set([...keys]);
        state.blocked = Array.from(blocked);
        state.latestMuted = createdAt;
      }
    },
    addDirectMessage: (state, action: PayloadAction<TaggedRawEvent | Array<TaggedRawEvent>>) => {
      let n = action.payload;
      if (!Array.isArray(n)) {
        n = [n];
      }

      let didChange = false;
      for (const x of n) {
        if (!state.dms.some(a => a.id === x.id)) {
          state.dms.push(x);
          didChange = true;
        }
      }

      if (didChange) {
        state.dms = [...state.dms];
      }
    },
    incDmInteraction: state => {
      state.dmInteraction += 1;
    },
    logout: state => {
      const relays = { ...state.relays };
      Object.assign(state, InitState);
      state.loggedOut = true;
      window.localStorage.clear();
      state.relays = relays;
      window.localStorage.setItem(RelayListKey, JSON.stringify(relays));
    },
    markNotificationsRead: state => {
      state.readNotifications = Math.ceil(new Date().getTime() / 1000);
      window.localStorage.setItem(NotificationsReadItem, state.readNotifications.toString());
    },
    setLatestNotifications: (state, action: PayloadAction<number>) => {
      state.latestNotification = action.payload;
    },
    setPreferences: (state, action: PayloadAction<UserPreferences>) => {
      state.preferences = action.payload;
      window.localStorage.setItem(UserPreferencesKey, JSON.stringify(state.preferences));
    },
    setFollowsRelays: (state, action: PayloadAction<Record<HexKey, FullRelaySettings[]>>) => {
      state.followsRelays = action.payload;
    },
  },
});

export const {
  init,
  setPrivateKey,
  setGeneratedPrivateKey,
  setPublicKey,
  setRelays,
  removeRelay,
  setFollows,
  setTags,
  setMuted,
  setPinned,
  setBookmarked,
  setBlocked,
  addDirectMessage,
  incDmInteraction,
  logout,
  markNotificationsRead,
  setLatestNotifications,
  setPreferences,
  setFollowsRelays,
} = LoginSlice.actions;

export function sendNotification({
  title,
  body,
  icon,
  timestamp,
}: NotificationRequest): ThunkAction<void, RootState, undefined, AnyAction> {
  return async (dispatch: AppDispatch, getState: () => RootState) => {
    const state = getState();
    const { readNotifications } = state.login;
    const hasPermission = "Notification" in window && Notification.permission === "granted";
    const shouldShowNotification = hasPermission && timestamp > readNotifications;
    if (shouldShowNotification) {
      try {
        const worker = await navigator.serviceWorker.ready;
        worker.showNotification(title, {
          tag: "notification",
          vibrate: [500],
          body,
          icon,
          timestamp,
        });
      } catch (error) {
        console.warn(error);
      }
    }
  };
}

export const reducer = LoginSlice.reducer;
