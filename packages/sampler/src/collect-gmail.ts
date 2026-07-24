/**
 * Gmail IMAP collector.
 *
 * Connects with an app password, scans today's INBOX (received) and Sent
 * (sent) messages, maps them to EmailMessage. All connection / parse logic
 * lives here; the pure mapper `toEmailMessage` is unit-testable in isolation.
 * Read-only: never flags, moves, or deletes mail.
 */
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

const SNIPPET_MAX = 2000;
const SUBJECT_MAX = 500;

export type EmailDirection = "received" | "sent";

export interface GmailConfig {
  user: string;
  password: string;
  host: string;
  port: number;
}

export interface EmailMessage {
  direction: EmailDirection;
  /** RFC Message-ID header (globally stable); null when absent. */
  messageId: string | null;
  uid: number;
  /** Mailbox UIDVALIDITY, for the fallback dedupe key when messageId is null. */
  uidValidity: string;
  from: string;
  fromName: string | null;
  to: string;
  toName: string | null;
  subject: string;
  /** UTC ISO, converted from envelope date. */
  receivedAt: string;
  /** Plain-text body, whitespace-collapsed and truncated. */
  snippet: string;
}

/** Minimal envelope shape consumed by the pure mapper (subset of ImapFlow). */
export interface RawFetch {
  direction: EmailDirection;
  uid: number;
  uidValidity: string;
  envelope:
    | {
        messageId?: string | null;
        subject?: string | null;
        date?: Date | null;
        from?: Array<{ address?: string | null; name?: string | null }> | null;
        to?: Array<{ address?: string | null; name?: string | null }> | null;
      }
    | null
    | undefined;
  text: string | null;
}

/**
 * Pure mapper: raw fetch → EmailMessage, or null when unusable.
 * Guards Invalid Date (never toISOString() on NaN — it throws RangeError).
 */
export function toEmailMessage(raw: RawFetch): EmailMessage | null {
  const env = raw.envelope;
  if (!env) return null;
  const date = env.date ?? null;
  if (!date || Number.isNaN(date.getTime())) return null;

  const from = env.from?.[0];
  const to = env.to?.[0];
  const subject = (env.subject ?? "").slice(0, SUBJECT_MAX);
  const snippet = (raw.text ?? "").replace(/\s+/g, " ").trim().slice(0, SNIPPET_MAX);

  return {
    direction: raw.direction,
    messageId: env.messageId ?? null,
    uid: raw.uid,
    uidValidity: raw.uidValidity,
    from: from?.address ?? "",
    fromName: from?.name ?? null,
    to: to?.address ?? "",
    toName: to?.name ?? null,
    subject,
    receivedAt: new Date(date.getTime()).toISOString(),
    snippet,
  };
}

/** Local midnight today — IMAP SINCE is date-granular (>= this day). */
function startOfTodayLocal(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Connect and fetch today's messages from INBOX + Sent.
 * Any connection / search / parse failure yields [] — never throws, so a bad
 * tick never blocks sampling or the outbox flush.
 */
export async function fetchTodayEmails(cfg: GmailConfig): Promise<EmailMessage[]> {
  const client = new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: true,
    auth: { user: cfg.user, pass: cfg.password },
    logger: false,
  });

  const out: EmailMessage[] = [];
  try {
    await client.connect();
    const since = startOfTodayLocal();

    const targets: Array<{ path: string; direction: EmailDirection }> = [
      { path: "INBOX", direction: "received" },
    ];
    const sentPath = await findSentMailbox(client);
    if (sentPath) targets.push({ path: sentPath, direction: "sent" });

    for (const t of targets) {
      const msgs = await fetchMailbox(client, t.path, t.direction, since).catch(
        () => [] as EmailMessage[],
      );
      out.push(...msgs);
    }
  } catch {
    return [];
  } finally {
    try {
      await client.logout();
    } catch {
      /* already disconnected */
    }
  }
  return out;
}

/** Resolve the Sent mailbox path via \Sent special-use, with Gmail fallback. */
async function findSentMailbox(client: ImapFlow): Promise<string | null> {
  try {
    const list = await client.list();
    const special = list.find((b) => b.specialUse === "\\Sent");
    if (special) return special.path;
    const gmail = list.find((b) => b.path === "[Gmail]/Sent Mail");
    return gmail?.path ?? null;
  } catch {
    return null;
  }
}

/** Fetch + map today's messages from one mailbox (read-only lock). */
async function fetchMailbox(
  client: ImapFlow,
  path: string,
  direction: EmailDirection,
  since: Date,
): Promise<EmailMessage[]> {
  const lock = await client.getMailboxLock(path);
  const res: EmailMessage[] = [];
  try {
    const box = client.mailbox;
    const uidValidity = box && typeof box !== "boolean" ? String(box.uidValidity) : "0";

    const uids = await client.search({ since }, { uid: true });
    if (!uids || uids.length === 0) return [];

    for await (const msg of client.fetch(
      uids,
      { uid: true, envelope: true, source: true },
      { uid: true },
    )) {
      let text: string | null = null;
      if (msg.source) {
        try {
          const parsed = await simpleParser(msg.source);
          text = parsed.text ?? null;
        } catch {
          text = null;
        }
      }
      const email = toEmailMessage({
        direction,
        uid: msg.uid,
        uidValidity,
        envelope: msg.envelope as RawFetch["envelope"],
        text,
      });
      // IMAP SINCE is date-granular and drifts by timezone (server may return
      // yesterday's tail). Enforce an exact local-midnight boundary so a daily
      // run only ingests today's mail — yesterday's was already sampled then.
      if (email && new Date(email.receivedAt).getTime() >= since.getTime()) {
        res.push(email);
      }
    }
  } finally {
    lock.release();
  }
  return res;
}
