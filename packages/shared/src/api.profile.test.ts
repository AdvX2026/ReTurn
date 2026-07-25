import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PatchUserProfileRequest, StatsTodayResponse, UserProfile } from "./api.js";

describe("profile contracts", () => {
  it("accepts a singleton profile payload", () => {
    const parsed = UserProfile.safeParse({
      display_name: "Teethe",
      profession: "coder",
      profession_mode: "auto",
      note: null,
      last_inferred_profession: "coder",
      accepted_todos: ["Ship profile API"],
      dismissed_todos: [],
      updated_at: "2026-07-25T12:00:00.000Z",
    });

    assert.equal(parsed.success, true);
  });

  it("bounds profile patches", () => {
    assert.equal(
      PatchUserProfileRequest.safeParse({ display_name: "x".repeat(81) }).success,
      false,
    );
    assert.equal(
      PatchUserProfileRequest.safeParse({ profession_mode: "manual" }).success,
      true,
    );
  });

  it("requires effective profession on live stats", () => {
    const base = {
      date: "2026-07-25",
      stats: { intake: 1, focus: 2, output: 3, continuity: 4, energy: 5 },
      character_state: "normal",
      saved: false,
      collection: { device_count: 0, sample_count: 0, last_seen_at: null },
    };

    assert.equal(StatsTodayResponse.safeParse(base).success, false);
    assert.equal(
      StatsTodayResponse.safeParse({
        ...base,
        profession: "generalist",
        profession_mode: "auto",
      }).success,
      true,
    );
  });
});
