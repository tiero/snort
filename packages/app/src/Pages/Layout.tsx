import "./Layout.css";
import { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

import { randomSample } from "Util";
import Envelope from "Icons/Envelope";
import Bell from "Icons/Bell";
import Search from "Icons/Search";
import { RootState } from "State/Store";
import { init, setRelays } from "State/Login";
import { System } from "@snort/nostr";
import ProfileImage from "Element/ProfileImage";
import useLoginFeed from "Feed/LoginFeed";
import { totalUnread } from "Pages/MessagesPage";
import { SnortPubKey } from "Const";
import useEventPublisher from "Feed/EventPublisher";
import useModeration from "Hooks/useModeration";
import { IndexedUDB, useDb } from "State/Users/Db";
import { db } from "Db";
import { bech32ToHex } from "Util";
import { NoteCreator } from "Element/NoteCreator";
import Plus from "Icons/Plus";
import { RelaySettings } from "@snort/nostr";
import { FormattedMessage } from "react-intl";
import messages from "./messages";

export default function Layout() {
  const location = useLocation();
  const [show, setShow] = useState(false);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { loggedOut, publicKey, relays, latestNotification, readNotifications, dms, preferences, newUserKey } =
    useSelector((s: RootState) => s.login);
  const { isMuted } = useModeration();
  const [pageClass, setPageClass] = useState("page");

  const usingDb = useDb();
  const pub = useEventPublisher();
  useLoginFeed();

  const shouldHideNoteCreator = useMemo(() => {
    const hideOn = ["/settings", "/messages", "/new", "/login", "/donate", "/p/"];
    return hideOn.some(a => location.pathname.startsWith(a));
  }, [location]);

  const shouldHideHeader = useMemo(() => {
    const hideOn = ["/login", "/new"];
    return hideOn.some(a => location.pathname.startsWith(a));
  }, [location]);

  useEffect(() => {
    if (location.pathname.startsWith("/login")) {
      setPageClass("");
    } else {
      setPageClass("page");
    }
  }, [location]);

  const hasNotifications = useMemo(
    () => latestNotification > readNotifications,
    [latestNotification, readNotifications]
  );
  const unreadDms = useMemo(
    () =>
      publicKey
        ? totalUnread(
            dms.filter(a => !isMuted(a.pubkey)),
            publicKey
          )
        : 0,
    [dms, publicKey]
  );

  useEffect(() => {
    System.nip42Auth = pub.nip42Auth;
  }, [pub]);

  useEffect(() => {
    System.UserDb = usingDb;
  }, [usingDb]);

  useEffect(() => {
    if (relays) {
      for (const [k, v] of Object.entries(relays)) {
        System.ConnectToRelay(k, v);
      }
      for (const [k, c] of System.Sockets) {
        if (!relays[k] && !c.Ephemeral) {
          System.DisconnectRelay(k);
        }
      }
    }
  }, [relays]);

  function setTheme(theme: "light" | "dark") {
    const elm = document.documentElement;
    if (theme === "light" && !elm.classList.contains("light")) {
      elm.classList.add("light");
    } else if (theme === "dark" && elm.classList.contains("light")) {
      elm.classList.remove("light");
    }
  }

  useEffect(() => {
    const osTheme = window.matchMedia("(prefers-color-scheme: light)");
    setTheme(
      preferences.theme === "system" && osTheme.matches ? "light" : preferences.theme === "light" ? "light" : "dark"
    );

    osTheme.onchange = e => {
      if (preferences.theme === "system") {
        setTheme(e.matches ? "light" : "dark");
      }
    };
    return () => {
      osTheme.onchange = null;
    };
  }, [preferences.theme]);

  useEffect(() => {
    // check DB support then init
    IndexedUDB.isAvailable().then(async a => {
      const dbType = a ? "indexdDb" : "redux";

      // cleanup on load
      if (dbType === "indexdDb") {
        await db.feeds.clear();
        const now = Math.floor(new Date().getTime() / 1000);

        const cleanupEvents = await db.events
          .where("created_at")
          .above(now - 60 * 60)
          .primaryKeys();
        console.debug(`Cleanup ${cleanupEvents.length} events`);
        await db.events.bulkDelete(cleanupEvents);
      }

      console.debug(`Using db: ${dbType}`);
      dispatch(init(dbType));

      try {
        if ("registerProtocolHandler" in window.navigator) {
          window.navigator.registerProtocolHandler(
            "web+nostr",
            `${window.location.protocol}//${window.location.host}/handler/%s`
          );
          console.info("Registered protocol handler for 'web+nostr'");
        }
      } catch (e) {
        console.error("Failed to register protocol handler", e);
      }
    });
  }, []);

  async function handleNewUser() {
    let newRelays: Record<string, RelaySettings> = {};

    try {
      const rsp = await fetch("https://api.nostr.watch/v1/online");
      if (rsp.ok) {
        const online: string[] = await rsp.json();
        const pickRandom = randomSample(online, 4);
        const relayObjects = pickRandom.map(a => [a, { read: true, write: true }]);
        newRelays = Object.fromEntries(relayObjects);
        dispatch(
          setRelays({
            relays: newRelays,
            createdAt: 1,
          })
        );
      }
    } catch (e) {
      console.warn(e);
    }

    const ev = await pub.addFollow(bech32ToHex(SnortPubKey), newRelays);
    pub.broadcast(ev);
  }

  useEffect(() => {
    if (newUserKey === true) {
      handleNewUser().catch(console.warn);
    }
  }, [newUserKey]);

  async function goToNotifications(e: React.MouseEvent) {
    e.stopPropagation();
    // request permissions to send notifications
    if ("Notification" in window) {
      try {
        if (Notification.permission !== "granted") {
          const res = await Notification.requestPermission();
          console.debug(res);
        }
      } catch (e) {
        console.error(e);
      }
    }
    navigate("/notifications");
  }

  function accountHeader() {
    return (
      <div className="header-actions">
        <div className="btn btn-rnd" onClick={() => navigate("/search")}>
          <Search />
        </div>
        <div className="btn btn-rnd" onClick={() => navigate("/messages")}>
          <Envelope />
          {unreadDms > 0 && <span className="has-unread"></span>}
        </div>
        <div className="btn btn-rnd" onClick={goToNotifications}>
          <Bell />
          {hasNotifications && <span className="has-unread"></span>}
        </div>
        <ProfileImage pubkey={publicKey || ""} showUsername={false} />
      </div>
    );
  }

  if (typeof loggedOut !== "boolean") {
    return null;
  }
  return (
    <div className={pageClass}>
      {!shouldHideHeader && (
        <header>
          <div className="logo" onClick={() => navigate("/")}>
            Snort
          </div>
          <div>
            {publicKey ? (
              accountHeader()
            ) : (
              <button type="button" onClick={() => navigate("/login")}>
                <FormattedMessage {...messages.Login} />
              </button>
            )}
          </div>
        </header>
      )}
      <Outlet />

      {!shouldHideNoteCreator && (
        <>
          <button className="note-create-button" type="button" onClick={() => setShow(!show)}>
            <Plus />
          </button>
          <NoteCreator replyTo={undefined} autoFocus={true} show={show} setShow={setShow} />
        </>
      )}
    </div>
  );
}
