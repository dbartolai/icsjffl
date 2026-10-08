import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateLeagueAnalytics } from "../src/lib/analytics/calculate";
import type { AnalyticsArchive, AnalyticsGame } from "../src/lib/analytics/types";

function game(
  season: number,
  week: number,
  id: string,
  homeTeamId: string,
  homeScore: number,
  awayTeamId: string,
  awayScore: number,
  isPlayoff = false,
): AnalyticsGame {
  return {
    season,
    week,
    gameId: id,
    homeTeamId,
    homeScore,
    awayTeamId,
    awayScore,
    isPlayoff,
  };
}

function fixture(): AnalyticsArchive {
  const teamNames: Record<string, string> = {
    A: "Alpha",
    B: "Bravo",
    C: "Charlie",
    D: "Delta",
  };
  return {
    seasons: [
      {
        season: 2024,
        leagueName: "Fixture League",
        regularSeasonWeeks: 2,
        isComplete: true,
      },
      {
        season: 2025,
        leagueName: "Fixture League",
        regularSeasonWeeks: 1,
        isComplete: true,
      },
    ],
    teams: [2024, 2025].flatMap((season) =>
      Object.entries(teamNames).map(([teamId, teamName]) => ({
        season,
        teamId,
        teamName:
          season === 2025 && teamId === "A" ? "Alpha Prime" : teamName,
        managerName: `${teamId} Manager`,
      })),
    ),
    games: [
      game(2024, 1, "1", "A", 100, "B", 80),
      game(2024, 1, "2", "C", 120, "D", 90),
      game(2024, 2, "3", "A", 70, "C", 90),
      game(2024, 2, "4", "B", 110, "D", 100),
      game(2024, 3, "5", "A", 200, "B", 50, true),
      game(2025, 1, "6", "A", 105, "B", 105),
      game(2025, 1, "7", "C", 95, "D", 85),
    ],
  };
}

test("calculates weekly all-play records, expected wins, and schedule luck", () => {
  const analytics = calculateLeagueAnalytics(fixture(), 2024);
  const alpha = analytics.franchises.find(({ teamId }) => teamId === "A");
  const charlie = analytics.franchises.find(({ teamId }) => teamId === "C");
  const delta = analytics.franchises.find(({ teamId }) => teamId === "D");

  assert.ok(alpha);
  assert.equal(alpha.wins, 1);
  assert.equal(alpha.losses, 1);
  assert.deepEqual(
    [alpha.allPlayWins, alpha.allPlayLosses, alpha.allPlayTies],
    [2, 4, 0],
  );
  assert.equal(alpha.allPlayPct, 1 / 3);
  assert.equal(alpha.expectedWins, 2 / 3);
  assert.ok(Math.abs(alpha.scheduleLuck - 1 / 3) < 1e-12);
  assert.equal(charlie?.scheduleLuck, 2 - 4 / 3);
  assert.equal(delta?.scheduleLuck, -1);
});

test("adds points context and weekly scoring volatility", () => {
  const analytics = calculateLeagueAnalytics(fixture(), 2024);
  const alpha = analytics.franchises.find(({ teamId }) => teamId === "A");

  assert.equal(analytics.totals.averageScore, 95);
  assert.equal(alpha?.pointsForPerGame, 85);
  assert.equal(alpha?.pointsAgainstPerGame, 85);
  assert.equal(alpha?.pointsForVsAverage, -10);
  assert.equal(alpha?.pointsAgainstVsAverage, -10);
  assert.equal(alpha?.weeklyStandardDeviation, 15);
  assert.equal(analytics.insights.mostConsistent?.teamId, "D");
  assert.equal(analytics.insights.mostVolatile?.teamId, "C");
});

test("keeps an ESPN team slot as one franchise after a rename", () => {
  const analytics = calculateLeagueAnalytics(fixture(), null);
  const alpha = analytics.franchises.find(({ teamId }) => teamId === "A");

  assert.equal(analytics.totals.seasons, 2);
  assert.equal(analytics.totals.franchises, 4);
  assert.equal(alpha?.teamName, "Alpha Prime");
  assert.equal(alpha?.seasons, 2);
  assert.equal(alpha?.games, 3);
  assert.equal(alpha?.ties, 1);
});

test("summarizes head-to-head rivalries and ignores playoff games", () => {
  const analytics = calculateLeagueAnalytics(fixture(), null);
  const alphaBravo = analytics.rivalries.find(({ id }) => id === "A-B");

  assert.ok(alphaBravo);
  assert.equal(analytics.totals.matchups, 6);
  assert.equal(alphaBravo.games, 2);
  assert.deepEqual(
    [alphaBravo.teamAWins, alphaBravo.teamBWins, alphaBravo.ties],
    [1, 0, 1],
  );
  assert.equal(alphaBravo.pointMargin, 20);
});

test("falls back to all-time for an unknown season and stays deterministic", () => {
  const source = fixture();
  const original = JSON.stringify(source);
  const first = calculateLeagueAnalytics(source, 1999);
  const second = calculateLeagueAnalytics(source, 1999);

  assert.equal(first.selectedSeason, null);
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(source), original);
});
