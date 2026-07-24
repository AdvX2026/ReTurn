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
}

/**
 * Pure mapper: raw fetch → EmailMessage, or null when unusable.
 * Guards Invalid Date (never toISOString() on NaN — it throws RangeError).
 */
export function toEmailMessage(raw: RawFetch): EmailMessage | null {
  const env = raw.envelope;
  if (!env) return null;
  const messageId = env.messageId?.trim();
  if (!messageId) return null;
  const date = env.date ?? null;
  if (!date || Number.isNaN(date.getTime())) return null;

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

/**
 * Connect and fetch messages from INBOX + Sent within the shared tick range.
 */
export async function fetchEmails(
  cfg: GmailConfig,
  range: { start: string; end: string },
): Promise<EmailMessage[]> {
  const client = new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: true,
    auth: { user: cfg.user, pass: cfg.password },
    logger: false,
  });

  const out: EmailMessage[] = [];
  let connected = false;
  try {
    await client.connect();
    connected = true;
    const since = new Date(range.start);
    const end = Date.parse(range.end);

    const targets: Array<{ path: string; direction: EmailDirection }> = [
      { path: "INBOX", direction: "received" },
    ];
    targets.push({ path: await findSentMailbox(client), direction: "sent" });

    for (const t of targets) {
      const msgs = await fetchMailbox(client, t.path, t.direction, since, end);
      out.push(...msgs);
    }
  } finally {
    if (connected) await client.logout();
  }
  return out;
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
): Promise<EmailMessage[]> {
  const lock = await client.getMailboxLock(path);
  const res: EmailMessage[] = [];
  try {
    const uids = await client.search({ since }, { uid: true });
    if (!uids || uids.length === 0) return [];

    for await (const msg of client.fetch(
      uids,
      { uid: true, envelope: true, source: true },
      { uid: true },
    )) {
      let text: string | null = null;
      if (msg.source) {
        const parsed = await simpleParser(msg.source);
        text = parsed.text ?? null;
      }
      const email = toEmailMessage({
        direction,
        envelope: msg.envelope as RawFetch["envelope"],
        text,
      });
      const receivedAt = email ? Date.parse(email.receivedAt) : Number.NaN;
      if (email && receivedAt >= since.getTime() && receivedAt < end) {
        res.push(email);
      }
    }
  } finally {
    lock.release();
  }
  return res;
}
