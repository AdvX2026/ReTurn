import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { type EmailMessage, toEmailMessage } from "./collect-gmail.js";
import { uuidFromSeed } from "./source.js";
import { emailsToNodes, resetSeenEmailKeys } from "./sources/gmail.js";

const DAY = "2026-07-24";

describe("toEmailMessage", () => {
  const base = {
    direction: "received" as const,
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
    assert.equal(em.direction, "received");
    assert.equal(em.messageId, "<abc@mail>");
    assert.equal(em.from, "boss@corp.com");
    assert.equal(em.fromName, "The Boss");
    assert.equal(em.to, "me@gmail.com");
    assert.equal(em.subject, "Weekly report");
    assert.equal(em.receivedAt, "2026-07-24T02:00:00.000Z");
    assert.equal(em.snippet, "hello body");
  });

  it("throws on missing or invalid envelope dates", () => {
    assert.throws(
      () =>
        toEmailMessage({
          ...base,
          envelope: {
            messageId: "<no-date@x>",
            subject: "no date",
          },
        }),
      /date is invalid/,
    );
    assert.throws(
      () =>
        toEmailMessage({
          ...base,
          envelope: {
            messageId: "<bad-date@x>",
            subject: "bad",
            date: new Date("not-a-date"),
          },
        }),
      /date is invalid/,
    );
    assert.throws(
      () => toEmailMessage({ ...base, envelope: null }),
      /envelope is missing/,
    );
  });

  it("throws when RFC Message-ID is missing", () => {
    assert.throws(
      () =>
        toEmailMessage({
          ...base,
          envelope: {
            subject: "x",
            date: new Date("2026-07-24T02:00:00.000Z"),
          },
        }),
      /RFC Message-ID is missing/,
    );
  });

  it("converts offset date to UTC ISO (Z)", () => {
    const em = toEmailMessage({
      ...base,
      envelope: {
        messageId: "<morning@x>",
        subject: "morning",
        date: new Date("2026-07-24T10:00:00+08:00"),
      },
    });
    assert.equal(em.receivedAt, "2026-07-24T02:00:00.000Z");
    assert.match(em.receivedAt, /Z$/);
  });

  it("collapses whitespace and truncates snippet to 2000 chars", () => {
    const long = `${"a".repeat(5000)}\n\t  spaced`;
    const em = toEmailMessage({
      ...base,
      text: long,
      envelope: {
        messageId: "<snippet@x>",
        subject: "s",
        date: new Date("2026-07-24T02:00:00.000Z"),
      },
    });
    assert.equal(em.snippet.length, 2000);
  });
});

describe("gmail source emission", () => {
  beforeEach(() => {
    resetSeenEmailKeys();
  });

  const msg = (over: Partial<EmailMessage> = {}): EmailMessage => ({
    direction: "received",
    messageId: "<m1@x>",
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
    const nodes = emailsToNodes([msg()], DAY);
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
    const n = emailsToNodes([msg({ direction: "sent", messageId: "<s1@x>" })], DAY)[0]!;
    const meta = n.source_meta as Record<string, unknown>;
    assert.equal(meta.direction, "sent");
    assert.equal(meta.mailbox, "SENT");
  });

  it("truncates subject to 500 chars for title", () => {
    const n = emailsToNodes(
      [msg({ messageId: "<long@x>", subject: "x".repeat(600) })],
      DAY,
    )[0]!;
    assert.equal(n.title!.length, 500);
  });

  it("empty snippet maps content to null", () => {
    const n = emailsToNodes([msg({ messageId: "<empty@x>", snippet: "" })], DAY)[0]!;
    assert.equal(n.content, null);
  });

  it("is deterministic by Message-ID", () => {
    const withId = emailsToNodes([msg({ messageId: "<same@x>" })], DAY)[0]!;
    resetSeenEmailKeys();
    const again = emailsToNodes([msg({ messageId: "<same@x>" })], DAY)[0]!;
    assert.equal(withId.client_uuid, again.client_uuid);
  });

  it("uses the shared context day", () => {
    const nodes = emailsToNodes(
      [
        msg({ messageId: "<d1@x>", receivedAt: "2026-07-24T01:00:00.000Z" }),
        msg({ messageId: "<d2@x>", receivedAt: "2026-07-24T15:00:00.000Z" }),
      ],
      DAY,
    );
    assert.equal(nodes[0]!.date, DAY);
    assert.equal(nodes[1]!.date, DAY);
  });

  it("dedupes in-process; reset re-emits", () => {
    const batch = [msg({ messageId: "<dup@x>" })];
    assert.equal(emailsToNodes(batch, DAY).length, 1);
    assert.equal(emailsToNodes(batch, DAY).length, 0);
    resetSeenEmailKeys();
    assert.equal(emailsToNodes(batch, DAY).length, 1);
  });
});
