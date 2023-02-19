import "./Zap.css";
import { useMemo } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { useSelector } from "react-redux";
import { decode as invoiceDecode } from "light-bolt11-decoder";
import { bytesToHex } from "@noble/hashes/utils";
import { sha256, unwrap } from "Util";
import { formatShort } from "Number";
import { HexKey, TaggedRawEvent } from "@snort/nostr";
import { Event } from "@snort/nostr";
import Text from "Element/Text";
import ProfileImage from "Element/ProfileImage";
import { RootState } from "State/Store";

import messages from "./messages";

function findTag(e: TaggedRawEvent, tag: string) {
  const maybeTag = e.tags.find(evTag => {
    return evTag[0] === tag;
  });
  return maybeTag && maybeTag[1];
}

function getInvoice(zap: TaggedRawEvent) {
  const bolt11 = findTag(zap, "bolt11");
  if (!bolt11) {
    console.debug("Invalid zap: ", zap);
    return {};
  }
  try {
    const decoded = invoiceDecode(bolt11);

    const amount = decoded.sections.find(section => section.name === "amount")?.value;
    const hash = decoded.sections.find(section => section.name === "description_hash")?.value;

    return { amount, hash: hash ? bytesToHex(hash as Uint8Array) : undefined };
  } catch {
    // ignore
  }
  return {};
}

interface Zapper {
  pubkey?: HexKey;
  isValid: boolean;
  isAnon: boolean;
}

function getZapper(zap: TaggedRawEvent, dhash: string): Zapper {
  let zapRequest = findTag(zap, "description");
  if (zapRequest) {
    try {
      if (zapRequest.startsWith("%")) {
        zapRequest = decodeURIComponent(zapRequest);
      }
      const rawEvent: TaggedRawEvent = JSON.parse(zapRequest);
      if (Array.isArray(rawEvent)) {
        // old format, ignored
        return { isValid: false, isAnon: false };
      }
      const anonZap = rawEvent.tags.some(a => a[0] === "anon");
      const metaHash = sha256(zapRequest);
      const ev = new Event(rawEvent);
      return { pubkey: ev.PubKey, isValid: dhash === metaHash, isAnon: anonZap };
    } catch (e) {
      console.warn("Invalid zap", zapRequest);
    }
  }
  return { isValid: false, isAnon: false };
}

export interface ParsedZap {
  id: HexKey;
  e?: HexKey;
  p: HexKey;
  amount: number;
  content: string;
  zapper?: HexKey;
  valid: boolean;
  zapService: HexKey;
  anonZap: boolean;
}

export function parseZap(zap: TaggedRawEvent): ParsedZap {
  const { amount, hash } = getInvoice(zap);
  const zapper = hash ? getZapper(zap, hash) : ({ isValid: false } as Zapper);
  const e = findTag(zap, "e");
  const p = unwrap(findTag(zap, "p"));
  return {
    id: zap.id,
    e,
    p,
    amount: Number(amount) / 1000,
    zapper: zapper.pubkey,
    content: zap.content,
    valid: zapper.isValid,
    zapService: zap.pubkey,
    anonZap: zapper.isAnon,
  };
}

const Zap = ({ zap, showZapped = true }: { zap: ParsedZap; showZapped?: boolean }) => {
  const { amount, content, zapper, valid, p } = zap;
  const pubKey = useSelector((s: RootState) => s.login.publicKey);

  return valid && zapper ? (
    <div className="zap note card">
      <div className="header">
        <ProfileImage autoWidth={false} pubkey={zapper} />
        {p !== pubKey && showZapped && <ProfileImage autoWidth={false} pubkey={p} />}
        <div className="amount">
          <span className="amount-number">
            <FormattedMessage {...messages.Sats} values={{ n: formatShort(amount) }} />
          </span>
        </div>
      </div>
      {content.length > 0 && zapper && (
        <div className="body">
          <Text creator={zapper} content={content} tags={[]} users={new Map()} />
        </div>
      )}
    </div>
  ) : null;
};

interface ZapsSummaryProps {
  zaps: ParsedZap[];
}

export const ZapsSummary = ({ zaps }: ZapsSummaryProps) => {
  const { formatMessage } = useIntl();
  const sortedZaps = useMemo(() => {
    const pub = [...zaps.filter(z => z.zapper && z.valid)];
    const priv = [...zaps.filter(z => !z.zapper && z.valid)];
    pub.sort((a, b) => b.amount - a.amount);
    return pub.concat(priv);
  }, [zaps]);

  if (zaps.length === 0) {
    return null;
  }

  const [topZap, ...restZaps] = sortedZaps;
  const { zapper, amount, anonZap } = topZap;

  return (
    <div className="zaps-summary">
      {amount && (
        <div className={`top-zap`}>
          <div className="summary">
            {zapper && (
              <ProfileImage
                autoWidth={false}
                pubkey={anonZap ? "" : zapper}
                overrideUsername={anonZap ? formatMessage({ defaultMessage: "Anonymous" }) : undefined}
              />
            )}
            {restZaps.length > 0 && <FormattedMessage {...messages.Others} values={{ n: restZaps.length }} />}{" "}
            <FormattedMessage {...messages.OthersZapped} values={{ n: restZaps.length }} />
          </div>
        </div>
      )}
    </div>
  );
};

export default Zap;
