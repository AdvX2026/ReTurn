/**
 * Gmail SampleSource.
 *
 * Fetches today's received + sent mail (collect-gmail.ts), maps to email nodes
 * with deterministic client_uuid. All discovery / connect / dedupe lives here;
 * collect.ts only registers this source.
 */
import type { NodeInput } from "@return/shared";
import { type EmailMessage, fetchTodayEmails } from "../collect-gmail.js";
import { config } from "../config.js";
import {
  type KeyDedupe,
  type SampleContext,
  type SampleSource,
  type SourceResult,
  createKeyDedupe,
  todayLocal,
  uuidFromSeed,
} from "../source.js";

const seen: KeyDedupe = createKeyDedupe();

/** Test helper: clear in-process email dedupe (simulates process restart). */
export function resetSeenEmailKeys(): void {
  seen.clear();
}

/** Stable dedupe key — Message-ID when present, else per-mailbox uid. */
function emailKey(m: EmailMessage): string {
  return m.messageId ?? `${m.direction}:${m.uidValidity}:${m.uid}`;
}

/** Deterministic seed → same message → same client_uuid across restarts. */
function emailSeed(m: EmailMessage): string {
  return m.messageId
    ? `gmail:${m.messageId}`
    : `gmail:${m.direction}:uidvalidity:${m.uidValidity}:uid:${m.uid}`;
}

export function emailsToNodes(
  emails: EmailMessage[],
  day?: string,
  dedupe: KeyDedupe = seen,
): NodeInput[] {
  const nodes: NodeInput[] = [];
  for (const m of emails) {
    if (!dedupe.tryAdd(emailKey(m))) continue;
    const title = m.subject.length > 500 ? m.subject.slice(0, 500) : m.subject;
    nodes.push({
      client_uuid: uuidFromSeed(emailSeed(m)),
      kind: "email",
      title,
      content: m.snippet || null,
      source_meta: {
        direction: m.direction,
        mailbox: m.direction === "sent" ? "SENT" : "INBOX",
        from: m.from,
        from_name: m.fromName,
        to: m.to,
        to_name: m.toName,
        subject: m.subject,
        received_at: m.receivedAt,
        message_id: m.messageId,
      },
      client_created_at: m.receivedAt,
      // Bucket by envelope time so cross-midnight mail lands on the right day.
      date: day ?? todayLocal(new Date(m.receivedAt)),
    });
  }
  return nodes;
}

export const gmailSource: SampleSource = {
  id: "gmail",
  async sample(ctx: SampleContext): Promise<SourceResult> {
    if (!config.gmail) {
      return { nodes: [], stats: { configured: 0 } };
    }
    const emails = await fetchTodayEmails(config.gmail, {
      start: ctx.dayStart,
      end: ctx.dayEnd,
    }).catch(() => [] as EmailMessage[]);
    const nodes = emailsToNodes(emails, ctx.day);
    return {
      nodes,
      stats: {
        configured: 1,
        emails: emails.length,
        received: emails.filter((e) => e.direction === "received").length,
        sent: emails.filter((e) => e.direction === "sent").length,
        emitted: nodes.length,
      },
    };
  },
};
