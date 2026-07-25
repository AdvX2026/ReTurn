import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { parseFixedNow, parseTimeZone, positiveInt } from "./config.js";

describe("positiveInt", () => {
  const KEY = "RETURN_TEST_POSITIVE_INT";

  afterEach(() => {
    delete process.env[KEY];
  });

  it("uses the declared default when unset or empty", () => {
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

  it("throws for fractions, zero, negative, non-numeric", () => {
    process.env[KEY] = "10.5";
    assert.throws(() => positiveInt(KEY, 100), /positive integer/);
    process.env[KEY] = "0";
    assert.throws(() => positiveInt(KEY, 100), /positive integer/);
    process.env[KEY] = "-3";
    assert.throws(() => positiveInt(KEY, 100), /positive integer/);
    process.env[KEY] = "nope";
    assert.throws(() => positiveInt(KEY, 100), /positive integer/);
  });
});

describe("global sampler clock config", () => {
  it("accepts an IANA timezone and rejects garbage", () => {
    assert.equal(parseTimeZone("Asia/Singapore"), "Asia/Singapore");
    assert.throws(() => parseTimeZone("not/a-zone"), /invalid SAMPLER_TIMEZONE/);
  });

  it("accepts only parseable fixed replay clocks", () => {
    assert.equal(
      parseFixedNow("2026-07-24T12:00:00+08:00")?.toISOString(),
      "2026-07-24T04:00:00.000Z",
    );
    assert.throws(() => parseFixedNow("garbage"), /invalid SAMPLER_NOW/);
    assert.equal(parseFixedNow(""), null);
  });
});
