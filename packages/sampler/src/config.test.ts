import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { positiveInt } from "./config.js";

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
