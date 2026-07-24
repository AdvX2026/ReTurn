import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { intervalMinForCadence } from "./cadence.js";

describe("intervalMinForCadence", () => {
  const intervals = { active: 5, night: 30 };

  it("maps active → daytime interval", () => {
    assert.equal(intervalMinForCadence("active", intervals), 5);
  });

  it("maps night → low-frequency interval", () => {
    assert.equal(intervalMinForCadence("night", intervals), 30);
  });

  it("floors to at least 1 minute", () => {
    assert.equal(intervalMinForCadence("active", { active: 0, night: 0 }), 1);
    assert.equal(intervalMinForCadence("night", { active: 5, night: -3 }), 1);
  });
});
