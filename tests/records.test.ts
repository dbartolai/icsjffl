import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  fetchEspnHistory,
  historicalSeasonUrl,
} from "../src/lib/espn/history";
import { normalizeHistoricalSeason } from "../src/lib/espn/history-normalize";
import type { HistoricalSeason } from "../src/lib/espn/history-types";
import { calculateRecordBook } from "../src/lib/records/calculate";

function fixture(season: number, active = false) {
  return {
    id: 123,
    seasonId: season,
    scoringPeriodId: 3,
    status: {
      isActive: active,
      latestScoringPeriod: active ? 2 : 4,
      finalScoringPeriod: 4,
    },
    settings: {
      name: "Fixture League",
      scheduleSettings: {
        matchupPeriodCount: 2,
        matchupPeriods: { "1": [1], "2": [2], "3": [3, 4] },
      },
    },
    members: [
      { id: "owner-1", displayName: "Ada" },
      { id: "owner-2", firstName: "Grace", lastName: "Hopper" },
    ],
    teams: [
      {
        id: 1,
        name: "Atoms",
        owners: ["owner-1"],
        rankCalculatedFinal: 1,
        record: {
          overall: {
            wins: 2,
            losses: 1,
            ties: 0,
            pointsFor: 330,
            pointsAgainst: 300,
          },
        },
      },
      {
        id: 2,
        location: "Binary",
        nickname: "Stars",
        primaryOwner: "owner-2",
        rankCalculatedFinal: 2,
        record: {
          overall: {
            wins: 1,
            losses: 2,
            ties: 0,
            pointsFor: 300,
            pointsAgainst: 330,
          },
        },
      },
    ],
    schedule: [
      {
        id: 10,
        matchupPeriodId: 1,
        home: { teamId: 1, totalPoints: 150 },
        away: { teamId: 2, totalPoints: 100 },
      },
      {
        id: 20,
        matchupPeriodId: 2,
        home: { teamId: 2, totalPoints: 121 },
        away: { teamId: 1, totalPoints: 120 },
      },
      {
        id: 30,
        matchupPeriodId: 3,
        home: {
          teamId: 1,
          totalPoints: 240,
          pointsByScoringPeriod: { "3": 130, "4": 110 },
        },
        away: {
          teamId: 2,
          totalPoints: 210,
          pointsByScoringPeriod: { "3": 100, "4": 110 },
        },
      },
    ],
    draftDetail: {
      picks: [
        {
          teamId: 1,
          playerId: 99,
          roundId: 1,
          roundPickNumber: 1,
          overallPickNumber: 1,
        },
      ],
    },
  };
}

const originalEnv = {
  leagueId: process.env.ESPN_LEAGUE_ID,
  s2: process.env.ESPN_S2,
  swid: process.env.ESPN_SWID,
};

afterEach(() => {
  if (originalEnv.leagueId === undefined) delete process.env.ESPN_LEAGUE_ID;
  else process.env.ESPN_LEAGUE_ID = originalEnv.leagueId;
  if (originalEnv.s2 === undefined) delete process.env.ESPN_S2;
  else process.env.ESPN_S2 = originalEnv.s2;
  if (originalEnv.swid === undefined) delete process.env.ESPN_SWID;
  else process.env.ESPN_SWID = originalEnv.swid;
});

test("normalizes owners, standings, draft picks and each scoring week", () => {
  const season = normalizeHistoricalSeason(fixture(2024), 2024);
  assert.equal(season.managers[1].displayName, "Grace Hopper");
  assert.equal(season.teams[1].name, "Binary Stars");
  assert.deepEqual(season.teams[1].managerIds, ["owner-2"]);
  assert.equal(season.championTeamId, "1");
  assert.equal(season.draftPicks[0].playerId, "99");
  assert.deepEqual(
    season.matchups.map((matchup) => [
      matchup.week,
      matchup.homeScore,
      matchup.awayScore,
      matchup.isPlayoff,
    ]),
    [
      [1, 150, 100, false],
      [2, 121, 120, false],
      [3, 130, 100, true],
      [4, 110, 110, true],
    ],
  );
});

test("does not infer a champion for an active season", () => {
  const season = normalizeHistoricalSeason(fixture(2026, true), 2026);
  assert.equal(season.championTeamId, null);
});

test("unwraps the pre-2018 leagueHistory response", () => {
  const season = normalizeHistoricalSeason([fixture(2017)], 2017);
  assert.equal(season.season, 2017);
  assert.equal(season.matchups.length, 4);
});

test("builds legacy and modern ESPN history URLs", () => {
  const legacy = historicalSeasonUrl("123", 2017);
  assert.equal(
    legacy.pathname,
    "/apis/v3/games/ffl/leagueHistory/123",
  );
  assert.equal(legacy.searchParams.get("seasonId"), "2017");
  assert.ok(legacy.searchParams.getAll("view").includes("mDraftDetail"));
  const modern = historicalSeasonUrl("123", 2018);
  assert.equal(
    modern.pathname,
    "/apis/v3/games/ffl/seasons/2018/segments/0/leagues/123",
  );
  assert.equal(modern.searchParams.has("seasonId"), false);
});

test("history fetching is selectable, authenticated, and fixture-driven", async () => {
  process.env.ESPN_LEAGUE_ID = "123";
  process.env.ESPN_S2 = "private-s2";
  process.env.ESPN_SWID = "{private-swid}";
  const requested: number[] = [];
  const result = await fetchEspnHistory({
    seasons: [2017, 2024],
    fetcher: async (input, init) => {
      const url = new URL(String(input));
      const season = Number(
        url.searchParams.get("seasonId") ??
          url.pathname.match(/seasons\/(\d+)/)?.[1],
      );
      requested.push(season);
      assert.equal(
        new Headers(init?.headers).get("Cookie"),
        "espn_s2=private-s2; SWID={private-swid}",
      );
      return Response.json(season === 2017 ? [fixture(season)] : fixture(season));
    },
  });
  assert.deepEqual(requested, [2017, 2024]);
  assert.deepEqual(
    result.map((season) => season.season),
    [2017, 2024],
  );
});

test("record calculations rank games and aggregate franchise history", () => {
  const first = normalizeHistoricalSeason(fixture(2023), 2023);
  const second: HistoricalSeason = {
    ...normalizeHistoricalSeason(fixture(2024), 2024),
    matchups: [
      {
        id: "2024-1-99",
        season: 2024,
        week: 1,
        matchupPeriod: 1,
        homeTeamId: "1",
        awayTeamId: "2",
        homeScore: 160,
        awayScore: 159,
        isPlayoff: false,
      },
    ],
  };
  const records = calculateRecordBook([first, second], 3);
  assert.equal(records.highestScores[0].points, 160);
  assert.equal(records.biggestBlowouts[0].margin, 50);
  assert.equal(
    Math.abs(
      records.closestGames[0].homeScore - records.closestGames[0].awayScore,
    ),
    0,
  );
  assert.equal(records.closestGames[1].id, "2024-1-99");
  assert.equal(records.mostPointsInLoss[0].points, 159);
  assert.equal(records.lowestScoresInWin[0].points, 121);
  assert.deepEqual(
    records.champions.map(({ season, team }) => [season, team.id]),
    [
      [2023, "1"],
      [2024, "1"],
    ],
  );
  assert.equal(records.teamSummaries[0].championships, 2);
  assert.equal(records.teamSummaries[0].seasons, 2);
  assert.equal(records.teamSummaries[0].wins, 4);
});

test("upstream errors do not expose response bodies or cookie values", async () => {
  process.env.ESPN_LEAGUE_ID = "123";
  process.env.ESPN_S2 = "secret-s2";
  process.env.ESPN_SWID = "{secret-swid}";
  await assert.rejects(
    fetchEspnHistory({
      seasons: [2024],
      fetcher: async () =>
        new Response("secret-s2 sensitive upstream body", { status: 500 }),
    }),
    (error: Error) =>
      !error.message.includes("secret-s2") &&
      !error.message.includes("sensitive upstream body"),
  );
});
