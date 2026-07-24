import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { type EmailMessage, toEmailMessage } from "./collect-gmail.js";
import { uuidFromSeed } from "./source.js";
import { emailsToNodes, resetSeenEmailKeys } from "./sources/gmail.js";

describe("toEmailMessage", () => {
  const base = {
    direction: "received" as const,
    uid: 42,
    uidValidity: "1",
    text: "hello body",
  };

  it("maps a full envelope", () => {
    const em = toEmailMessage({
      ...base,
      envelope: {
        messageId: "<abc@mail>",
        subject: "Weekly report",
        date: new Date("2026-07-24T02:00:00.000Z"),
        from: [{ address: "boss@corp.com", name: "The Boss" }],
        to: [{ address: "me@gmail.com", name: "Me" }],
      },
    });
    assert.ok(em);
    assert.equal(em!.direction, "received");
    assert.equal(em!.messageId, "<abc@mail>");
    assert.equal(em!.from, "boss@corp.com");
    assert.equal(em!.fromName, "The Boss");
    assert.equal(em!.to, "me@gmail.com");
    assert.equal(em!.subject, "Weekly report");
    assert.equal(em!.receivedAt, "2026-07-24T02:00:00.000Z");
    assert.equal(em!.snippet, "hello body");
  });

  it("returns null on missing or invalid date without throwing", () => {
    assert.equal(toEmailMessage({ ...base, envelope: { subject: "no date" } }), null);
    assert.equal(
      toEmailMessage({
        ...base,
        envelope: { subject: "bad", date: new Date("not-a-date") },
      }),
      null,
    );
    assert.equal(toEmailMessage({ ...base, envelope: null }), null);
  });

  it("allows null messageId (uid fallback happens at node layer)", () => {
    const em = toEmailMessage({
      ...base,
      envelope: { subject: "x", date: new Date("2026-07-24T02:00:00.000Z") },
    });
    assert.ok(em);
    assert.equal(em!.messageId, null);
    assert.equal(em!.from, "");
    assert.equal(em!.fromName, null);
  });

  it("converts offset date to UTC ISO (Z)", () => {
    const em = toEmailMessage({
      ...base,
      envelope: {
        subject: "morning",
        date: new Date("2026-07-24T10:00:00+08:00"),
      },
    });
    assert.ok(em);
    assert.equal(em!.receivedAt, "2026-07-24T02:00:00.000Z");
    assert.match(em!.receivedAt, /Z$/);
  });

  it("collapses whitespace and truncates snippet to 2000 chars", () => {
    const long = `${"a".repeat(5000)}\n\t  spaced`;
    const em = toEmailMessage({
      ...base,
      text: long,
      envelope: { subject: "s", date: new Date("2026-07-24T02:00:00.000Z") },
    });
    assert.ok(em);
    assert.equal(em!.snippet.length, 2000);
  });
});

describe("gmail source emission", () => {
  beforeEach(() => {
    resetSeenEmailKeys();
  });

  const msg = (over: Partial<EmailMessage> = {}): EmailMessage => ({
    direction: "received",
    messageId: "<m1@x>",
    uid: 1,
    uidValidity: "9",
    from: "a@x.com",
    fromName: "A",
    to: "me@gmail.com",
    toName: "Me",
    subject: "hi",
    receivedAt: "2026-07-24T02:00:00.000Z",
    snippet: "body",
    ...over,
  });

  it("maps received mail to an email node (INBOX + intake meta)", () => {
    const nodes = emailsToNodes([msg()]);
    assert.equal(nodes.length, 1);
    const n = nodes[0]!;
    assert.equal(n.kind, "email");
    assert.equal(n.title, "hi");
    assert.equal(n.content, "body");
    assert.equal(n.client_uuid, uuidFromSeed("gmail:<m1@x>"));
    assert.equal(n.client_created_at, "2026-07-24T02:00:00.000Z");
    assert.deepEqual(n.source_meta, {
      direction: "received",
      mailbox: "INBOX",
      from: "a@x.com",
      from_name: "A",
      to: "me@gmail.com",
      to_name: "Me",
      subject: "hi",
      received_at: "2026-07-24T02:00:00.000Z",
      message_id: "<m1@x>",
    });
  });

  it("maps sent mail to SENT mailbox meta", () => {
    const n = emailsToNodes([msg({ direction: "sent", messageId: "<s1@x>" })])[0]!;
    const meta = n.source_meta as Record<string, unknown>;
    assert.equal(meta.direction, "sent");
    assert.equal(meta.mailbox, "SENT");
  });

  it("truncates subject to 500 chars for title", () => {
    const n = emailsToNodes([
      msg({ messageId: "<long@x>", subject: "x".repeat(600) }),
    ])[0]!;
    assert.equal(n.title!.length, 500);
  });

  it("empty snippet maps content to null", () => {
    const n = emailsToNodes([msg({ messageId: "<empty@x>", snippet: "" })])[0]!;
    assert.equal(n.content, null);
  });

  it("is deterministic by messageId; falls back to uid when absent", () => {
    const withId = emailsToNodes([msg({ messageId: "<same@x>" })])[0]!;
    resetSeenEmailKeys();
    const again = emailsToNodes([msg({ messageId: "<same@x>" })])[0]!;
    assert.equal(withId.client_uuid, again.client_uuid);

    resetSeenEmailKeys();
    const noId = emailsToNodes([
      msg({ messageId: null, direction: "sent", uidValidity: "9", uid: 7 }),
    ])[0]!;
    assert.equal(noId.client_uuid, uuidFromSeed("gmail:sent:uidvalidity:9:uid:7"));
  });

  it("dates mail by envelope local day (cross-midnight)", () => {
    const d1 = new Date();
    d1.setHours(12, 0, 0, 0);
    const d2 = new Date(d1);
    d2.setDate(d2.getDate() + 1);
    const ymd = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    };

    const nodes = emailsToNodes([
      msg({ messageId: "<d1@x>", receivedAt: d1.toISOString() }),
      msg({ messageId: "<d2@x>", receivedAt: d2.toISOString() }),
    ]);
    assert.equal(nodes[0]!.date, ymd(d1));
    assert.equal(nodes[1]!.date, ymd(d2));
    assert.notEqual(nodes[0]!.date, nodes[1]!.date);
  });

  it("dedupes in-process; reset re-emits", () => {
    const batch = [msg({ messageId: "<dup@x>" })];
    assert.equal(emailsToNodes(batch).length, 1);
    assert.equal(emailsToNodes(batch).length, 0);
    resetSeenEmailKeys();
    assert.equal(emailsToNodes(batch).length, 1);
  });
});
