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
/** Cap raw RFC822 download; we only need enough for a text snippet. */
const SOURCE_MAX_BYTES = 256 * 1024;

export type EmailDirection = "received" | "sent";

export interface GmailConfig {
  user: string;
  password: string;
  host: string;
  port: number;
}

export interface EmailMessage {
  direction: EmailDirection;
  /** RFC Message-ID header (globally stable). */
  messageId: string;
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
  /** IMAP UID; with uidValidity it forms a stable fallback identity. */
  uid?: number;
  uidValidity?: bigint;
  /** Server INTERNALDATE (delivery time); trusted over the sender's Date header. */
  internalDate?: Date | null;
}

function isValidDate(d: Date | null | undefined): d is Date {
  return d instanceof Date && !Number.isNaN(d.getTime());
}

/**
 * Pure mapper: raw fetch → EmailMessage.
 * Identity falls back to uidvalidity:uid and timestamps to INTERNALDATE, so a
 * single malformed message cannot take down the whole source; only messages
 * with no usable identity/timestamp at all are rejected.
 */
export function toEmailMessage(raw: RawFetch): EmailMessage {
  const env = raw.envelope;
  if (!env) throw new Error("Gmail message envelope is missing");
  let messageId = env.messageId?.trim();
  if (!messageId) {
    if (raw.uid !== undefined && raw.uidValidity !== undefined) {
      messageId = `imap:${raw.uidValidity}:${raw.uid}`;
    } else {
      throw new Error("Gmail message RFC Message-ID is missing");
    }
  }
  // received: prefer server INTERNALDATE (sender Date headers drift/forge);
  // sent: the Date header is our own send time, INTERNALDATE is the fallback.
  const claimed = env.date ?? null;
  const internal = raw.internalDate ?? null;
  const date =
    raw.direction === "received"
      ? isValidDate(internal)
        ? internal
        : claimed
      : isValidDate(claimed)
        ? claimed
        : internal;
  if (!isValidDate(date)) {
    throw new Error(`Gmail message date is invalid: ${messageId}`);
  }

  const from = env.from?.[0];
  const to = env.to?.[0];
  const subject = (env.subject ?? "").slice(0, SUBJECT_MAX);
  const snippet = (raw.text ?? "").replace(/\s+/g, " ").trim().slice(0, SNIPPET_MAX);

  return {
    direction: raw.direction,
    messageId,
    from: from?.address ?? "",
    fromName: from?.name ?? null,
    to: to?.address ?? "",
    toName: to?.name ?? null,
    subject,
    receivedAt: new Date(date.getTime()).toISOString(),
    snippet,
  };
}

/** Result of a full fetch pass; skipped counts unmappable messages. */
export interface FetchEmailsResult {
  emails: EmailMessage[];
  /** Messages dropped for having no usable identity/timestamp. */
  skipped: number;
  /** True when the Sent mailbox could not be resolved (INBOX still sampled). */
  sentMailboxMissing: boolean;
}

/**
 * Connect and fetch messages from INBOX + Sent within the shared tick range.
 */
export async function fetchEmails(
  cfg: GmailConfig,
  range: { start: string; end: string },
): Promise<FetchEmailsResult> {
  const client = new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: true,
    auth: { user: cfg.user, pass: cfg.password },
    logger: false,
  });

  const out: EmailMessage[] = [];
  let skipped = 0;
  let sentMailboxMissing = false;
  let connected = false;
  try {
    await client.connect();
    connected = true;
    const since = new Date(range.start);
    const end = Date.parse(range.end);

    const targets: Array<{ path: string; direction: EmailDirection }> = [
      { path: "INBOX", direction: "received" },
    ];
    try {
      targets.push({ path: await findSentMailbox(client), direction: "sent" });
    } catch {
      // Sent hidden from IMAP must not cost us the INBOX pass.
      sentMailboxMissing = true;
    }

    for (const t of targets) {
      const res = await fetchMailbox(client, t.path, t.direction, since, end);
      out.push(...res.messages);
      skipped += res.skipped;
    }
  } finally {
    if (connected) {
      try {
        await client.logout();
      } catch {
        // Dead connection: destroy the socket without masking the original error.
        client.close();
      }
    }
  }
  return { emails: out, skipped, sentMailboxMissing };
}

/** Resolve the Sent mailbox path across Gmail's supported IMAP schemas. */
async function findSentMailbox(client: ImapFlow): Promise<string> {
  const list = await client.list();
  const mailbox =
    list.find((candidate) => candidate.specialUse === "\\Sent") ??
    list.find((candidate) => candidate.path === "[Gmail]/Sent Mail");
  if (!mailbox) throw new Error("Gmail Sent mailbox not found");
  return mailbox.path;
}

/** Fetch + map today's messages from one mailbox (read-only lock). */
async function fetchMailbox(
  client: ImapFlow,
  path: string,
  direction: EmailDirection,
  since: Date,
  end: number,
): Promise<{ messages: EmailMessage[]; skipped: number }> {
  const lock = await client.getMailboxLock(path);
  const res: EmailMessage[] = [];
  let skipped = 0;
  try {
    const uids = await client.search({ since }, { uid: true });
    if (!uids || uids.length === 0) return { messages: [], skipped: 0 };
    const uidValidity =
      typeof client.mailbox === "object" ? client.mailbox.uidValidity : undefined;

    for await (const msg of client.fetch(
      uids,
      {
        uid: true,
        envelope: true,
        internalDate: true,
        source: { maxLength: SOURCE_MAX_BYTES },
      },
      { uid: true },
    )) {
      let email: EmailMessage;
      try {
        let text: string | null = null;
        if (msg.source) {
          const parsed = await simpleParser(msg.source);
          text = parsed.text ?? null;
        }
        const internal = msg.internalDate ? new Date(msg.internalDate) : null;
        email = toEmailMessage({
          direction,
          envelope: msg.envelope as RawFetch["envelope"],
          text,
          uid: msg.uid,
          uidValidity,
          internalDate: internal,
        });
      } catch {
        // One malformed message must not cost the whole day's mail.
        skipped++;
        continue;
      }
      const receivedAt = Date.parse(email.receivedAt);
      if (receivedAt >= since.getTime() && receivedAt < end) {
        res.push(email);
      }
    }
  } finally {
    lock.release();
  }
  return { messages: res, skipped };
}
