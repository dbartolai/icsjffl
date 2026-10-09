import assert from "node:assert/strict";
import test from "node:test";
import {
  clampPlayerPage,
  filterDrafts,
  parseWeek,
  type DraftPick,
} from "../src/lib/player-history";

const drafts: DraftPick[] = [
  { season: 2024, round: 1, round_pick: 3, overall_pick: 3, team_id: "one" },
  { season: 2025, round: 2, round_pick: 1, overall_pick: 11, team_id: "two" },
];

test("keeps recorded playoff week 19 selectable", () => {
  assert.equal(parseWeek("19"), 19);
  assert.equal(parseWeek("31"), null);
});

test("filters draft history with the selected season", () => {
  assert.deepEqual(filterDrafts(drafts, 2025), [drafts[1]]);
  assert.deepEqual(filterDrafts(drafts, null), drafts);
});

test("clamps an out-of-range player page to the final available page", () => {
  assert.equal(clampPlayerPage(100, 747), 30);
  assert.equal(clampPlayerPage(1, 0), 1);
});
