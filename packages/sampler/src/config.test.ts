import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { fixedNow, positiveInt, timeZone } from "./config.js";

describe("positiveInt", () => {
  const KEY = "RETURN_TEST_POSITIVE_INT";

  afterEach(() => {
    delete process.env[KEY];
  });

  it("returns fallback when unset or empty", () => {
    delete process.env[KEY];
    assert.equal(positiveInt(KEY, 100), 100);
    process.env[KEY] = "";
    assert.equal(positiveInt(KEY, 100), 100);
  });

  it("accepts positive integers", () => {
    process.env[KEY] = "50";
    assert.equal(positiveInt(KEY, 100), 50);
    process.env[KEY] = "1";
    assert.equal(positiveInt(KEY, 100), 1);
  });

  it("rejects fractions, zero, negative, non-numeric (SQLite LIMIT safety)", () => {
    process.env[KEY] = "10.5";
    assert.equal(positiveInt(KEY, 100), 100);
    process.env[KEY] = "0";
    assert.equal(positiveInt(KEY, 100), 100);
    process.env[KEY] = "-3";
    assert.equal(positiveInt(KEY, 100), 100);
    process.env[KEY] = "nope";
    assert.equal(positiveInt(KEY, 100), 100);
  });
});

describe("global sampler clock config", () => {
  it("accepts an IANA timezone and falls back for garbage", () => {
    assert.equal(timeZone("Asia/Singapore"), "Asia/Singapore");
    assert.notEqual(timeZone("not/a-zone"), "not/a-zone");
  });

  it("accepts only parseable fixed replay clocks", () => {
    assert.equal(
      fixedNow("2026-07-24T12:00:00+08:00")?.toISOString(),
      "2026-07-24T04:00:00.000Z",
    );
    assert.equal(fixedNow("garbage"), null);
    assert.equal(fixedNow(""), null);
  });
});
