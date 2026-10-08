import assert from "node:assert/strict";
import { test } from "node:test";
import { queryLeagueHistory } from "../src/lib/league-query";
import type { HistoricalSeason } from "../src/lib/espn/history-types";

function season(
  year: number,
  championTeamId: string | null,
  games: HistoricalSeason["matchups"],
): HistoricalSeason {
  return {
    leagueId: "fixture-league",
    leagueName: "Fixture League",
    season: year,
    managers: [
      { id: "manager-a", displayName: "Avery" },
      { id: "manager-b", displayName: "Blair" },
      { id: "manager-c", displayName: "Avery" },
    ],
    teams: [
      {
        id: "1",
        season: year,
        name: "Alpha",
        abbreviation: "ALP",
        managerIds: ["manager-a"],
        wins: 1,
        losses: 1,
        ties: 1,
        pointsFor: 290,
        pointsAgainst: 290,
        finalRank: championTeamId ? 1 : null,
      },
      {
        id: "2",
        season: year,
        name: "Bravo",
        abbreviation: "BRV",
        managerIds: ["manager-b"],
        wins: 1,
        losses: 2,
        ties: 0,
        pointsFor: 275,
        pointsAgainst: 310,
        finalRank: championTeamId ? 2 : null,
      },
      {
        id: "3",
        season: year,
        name: "Charlie",
        abbreviation: "CHR",
        managerIds: ["manager-c"],
        wins: 1,
        losses: 1,
        ties: 1,
        pointsFor: 300,
        pointsAgainst: 265,
        finalRank: championTeamId ? 3 : null,
      },
    ],
    matchups: games,
    draftPicks: [],
    championTeamId,
  };
}

const history = [
  season(2024, "1", [
    {
      id: "2024-1-10",
      season: 2024,
      week: 1,
      matchupPeriod: 1,
      homeTeamId: "1",
      awayTeamId: "2",
      homeScore: 100,
      awayScore: 80,
      isPlayoff: false,
    },
    {
      id: "2024-2-20",
      season: 2024,
      week: 2,
      matchupPeriod: 2,
      homeTeamId: "1",
      awayTeamId: "3",
      homeScore: 90,
      awayScore: 90,
      isPlayoff: false,
    },
    {
      id: "2024-3-30",
      season: 2024,
      week: 3,
      matchupPeriod: 3,
      homeTeamId: "2",
      awayTeamId: "3",
      homeScore: 85,
      awayScore: 110,
      isPlayoff: true,
    },
  ]),
  season(2026, null, [
    {
      id: "2026-1-10",
      season: 2026,
      week: 1,
      matchupPeriod: 1,
      homeTeamId: "1",
      awayTeamId: "2",
      homeScore: 120,
      awayScore: 130,
      isPlayoff: false,
    },
  ]),
];

test("returns cited blowouts and highest losses with deterministic ties", () => {
  const blowouts = queryLeagueHistory(history, {
    operation: "biggest-blowouts",
    limit: 2,
  });
  assert.equal(blowouts.status, "ok");
  assert.equal(blowouts.data.kind, "scored-games");
  assert.deepEqual(
    blowouts.data.games.map((game) => [game.teamId, game.margin, game.citation.path]),
    [
      ["3", 25, "season/2024/week/3/game/2024-3-30/team/3"],
      ["1", 20, "season/2024/week/1/game/2024-1-10/team/1"],
    ],
  );

  const losses = queryLeagueHistory(history, {
    operation: "highest-scores",
    lossesOnly: true,
  });
  assert.equal(losses.status, "ok");
  assert.equal(losses.data.kind, "scored-games");
  assert.deepEqual(
    losses.data.games.map((game) => [game.teamId, game.points, game.result]),
    [
      ["1", 120, "loss"],
      ["2", 85, "loss"],
      ["2", 80, "loss"],
    ],
  );
});

test("summarizes validated franchises and labels partial scopes", () => {
  const result = queryLeagueHistory(history, {
    operation: "head-to-head",
    teamAId: "1",
    teamBId: "2",
  });
  assert.equal(result.status, "ok");
  assert.equal(result.data.kind, "head-to-head");
  assert.equal(result.scope.hasPartialSeason, true);
  assert.deepEqual(result.scope.partialSeasons, [2026]);
  assert.deepEqual(
    [
      result.data.summary.games,
      result.data.summary.teamAWins,
      result.data.summary.teamBWins,
      result.data.summary.teamAPoints,
      result.data.summary.teamBPoints,
    ],
    [2, 1, 1, 220, 210],
  );
  assert.equal(
    result.data.summary.gamesPlayed[0].citation.path,
    "season/2026/week/1/game/2026-1-10/team/1",
  );
});

test("uses existing analytics for a season team summary", () => {
  const result = queryLeagueHistory(history, {
    operation: "team-season-summary",
    season: 2024,
    teamId: "1",
  });
  assert.equal(result.status, "ok");
  assert.equal(result.data.kind, "team-season-summary");
  assert.deepEqual(
    [result.data.summary.games, result.data.summary.wins, result.data.summary.ties],
    [2, 1, 1],
  );
  assert.equal(result.data.summary.citation.path, "season/2024/team/1");
});

test("returns standings and record lookups with their stored citations", () => {
  const standings = queryLeagueHistory(history, {
    operation: "season-standings",
    season: 2024,
  });
  assert.equal(standings.status, "ok");
  assert.equal(standings.data.kind, "standings");
  assert.deepEqual(
    standings.data.standings.map((entry) => [entry.rank, entry.teamId, entry.citation.path]),
    [
      [1, "1", "season/2024/team/1"],
      [2, "2", "season/2024/team/2"],
      [3, "3", "season/2024/team/3"],
    ],
  );

  const record = queryLeagueHistory(history, {
    operation: "record",
    kind: "most-points-in-loss",
  });
  assert.equal(record.status, "ok");
  assert.equal(record.data.kind, "record");
  assert.equal(record.data.record?.points, 120);
  assert.equal(record.data.record?.citation.gameId, "2026-1-10");
});

test("returns bounded validation, resolution, and no-data results without changing input", () => {
  const original = JSON.stringify(history);
  const invalid = queryLeagueHistory(history, {
    operation: "highest-scores",
    limit: 26,
  });
  assert.deepEqual(invalid, {
    status: "invalid-input",
    operation: "highest-scores",
    errors: ["Limit must be an integer from 1 through 25."],
  });

  const ambiguous = queryLeagueHistory(history, {
    operation: "team-season-summary",
    season: 2024,
    managerName: "avery",
  });
  assert.equal(ambiguous.status, "resolution-needed");
  assert.equal(ambiguous.reason, "ambiguous-manager");
  assert.deepEqual(ambiguous.candidates.map((candidate) => candidate.teamId), ["1", "3"]);

  const unavailable = queryLeagueHistory(history, {
    operation: "season-standings",
    season: 2017,
  });
  assert.deepEqual(unavailable, {
    status: "no-data",
    operation: "season-standings",
    reason: "unavailable-season",
    requestedSeason: 2017,
    availableSeasons: [2024, 2026],
  });

  const empty = queryLeagueHistory([], { operation: "record", kind: "highest-score" });
  assert.deepEqual(empty, {
    status: "no-data",
    operation: "record",
    reason: "no-record",
    availableSeasons: [],
  });

  const unknownFranchise = queryLeagueHistory(history, {
    operation: "head-to-head",
    teamAId: "1",
    teamBId: "404",
  });
  assert.deepEqual(unknownFranchise, {
    status: "no-data",
    operation: "head-to-head",
    reason: "unknown-team",
    availableSeasons: [2024, 2026],
  });
  assert.equal(JSON.stringify(history), original);
});
