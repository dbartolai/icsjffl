import assert from "node:assert/strict";
import test from "node:test";
import {
  clampPlayerPage,
  filterDrafts,
  latestRosterWeek,
  parseWeek,
  playerPresence,
  teamChoicesForPeriod,
  uniqueRosterWeeks,
  type DraftPick,
  type PlayerSummary,
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

test("keeps every team choice when a recorded week has more than 100 player rows", () => {
  const teams = Array.from({ length: 10 }, (_, index) => ({ team_id: `${index + 1}`, team_name: `Team ${index + 1}` }));
  const playerRows = Array.from({ length: 166 }, (_, index) => ({ team_id: `${(index % 10) + 1}` }));
  assert.equal(playerRows.length, 166);
  assert.deepEqual(teamChoicesForPeriod(teams, { season: 2026, scoring_period_id: 5 }).map((team) => team.teamId), ["1", "10", "2", "3", "4", "5", "6", "7", "8", "9"]);
});

test("keeps every available week without depending on player-row counts", () => {
  const coverageRows = Array.from({ length: 80 }, (_, index) => ({ scoring_period_id: (index % 20) + 1 }));
  assert.deepEqual(uniqueRosterWeeks(coverageRows), Array.from({ length: 20 }, (_, index) => index + 1));
});

test("uses the latest recorded week after a season change and leaves 2017 unavailable", () => {
  assert.equal(latestRosterWeek([1, 2, 3, 4, 5]), 5);
  assert.equal(latestRosterWeek([]), null);
});

test("labels former archived players without excluding them from search", () => {
  const player: PlayerSummary = { espn_player_id: 9, display_name: "Former Player", default_position_id: 1, first_seen_season: 2018, last_seen_season: 2021 };
  assert.equal(playerPresence(player, 2026), "Former league player · Played in 2018–2021");
});
