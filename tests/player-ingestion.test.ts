import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { fetchCurrentPlayerImport, fetchHistoricalPlayerImport } from "../src/lib/espn/player-ingestion/fetch";
import { normalizePlayerPeriod, normalizeTransactions } from "../src/lib/espn/player-ingestion/normalize";
import { persistCurrentPlayerImport } from "../src/lib/espn/player-ingestion/store";
import type { CurrentPlayerImport } from "../src/lib/espn/player-ingestion/types";

const originalFetch = global.fetch;
const env = ["ESPN_LEAGUE_ID", "ESPN_S2", "ESPN_SWID"] as const;
const originalEnv = Object.fromEntries(env.map((name) => [name, process.env[name]]));

afterEach(() => {
  global.fetch = originalFetch;
  for (const name of env) {
    if (originalEnv[name] === undefined) delete process.env[name];
    else process.env[name] = originalEnv[name];
  }
});

function entry(playerId: number, points: number) {
  return {
    playerId,
    lineupSlotId: playerId,
    playerPoolEntry: {
      id: playerId,
      appliedStatTotal: points,
      player: {
        id: playerId,
        fullName: `Fixture ${playerId}`,
        defaultPositionId: 2,
        proTeamId: 11,
        injuryStatus: "ACTIVE",
        injured: false,
        eligibleSlots: [2, 23],
        stats: [
          {
            scoringPeriodId: 1,
            statSourceId: 1,
            statSplitTypeId: 1,
            appliedTotal: points - 1,
          },
        ],
      },
    },
  };
}

function periodPayload(overrides: Record<string, unknown> = {}) {
  const first = entry(101, 11.25);
  const second = entry(202, 8.5);
  return {
    seasonId: 2026,
    scoringPeriodId: 1,
    teams: [
      { id: 1, roster: { entries: [first] } },
      { id: 2, roster: { entries: [second] } },
    ],
    schedule: [
      {
        home: { rosterForCurrentScoringPeriod: { entries: [first] } },
        away: { rosterForCurrentScoringPeriod: { entries: [second] } },
      },
    ],
    ...overrides,
  };
}

function normalized() {
  return normalizePlayerPeriod({
    leagueId: "123",
    season: 2026,
    scoringPeriodId: 1,
    expectedTeamIds: ["1", "2"],
    payload: periodPayload(),
    observedAt: "2026-10-08T00:00:00.000Z",
    transactionEvidenceStatus: "confirmed",
    lineupSlotCounts: { "2": 2, "23": 1 },
  });
}

test("normalizes only complete direct weekly evidence", () => {
  const result = normalized();
  assert.equal(result.coverage.rosterEvidenceStatus, "confirmed");
  assert.equal(result.coverage.actualScoreEvidenceStatus, "confirmed");
  assert.equal(result.coverage.projectionEvidenceStatus, "confirmed");
  assert.equal(result.coverage.lineupRuleEvidenceStatus, "confirmed");
  assert.deepEqual(result.entries[0].eligibleLineupSlotIds, [2, 23]);
  assert.equal(result.entries[0].actualPoints, 11.25);
});

test("rejects an incomplete roster instead of claiming weekly coverage", () => {
  const payload = periodPayload({
    teams: [{ id: 1, roster: { entries: [entry(101, 11.25)] } }],
  });
  assert.throws(
    () =>
      normalizePlayerPeriod({
        leagueId: "123",
        season: 2026,
        scoringPeriodId: 1,
        expectedTeamIds: ["1", "2"],
        payload,
        observedAt: "2026-10-08T00:00:00.000Z",
        transactionEvidenceStatus: "confirmed",
        lineupSlotCounts: null,
      }),
    /every expected roster team/,
  );
});

test("does not turn missing projections into zeroes", () => {
  const payload = periodPayload();
  const first = (
    payload.teams[0] as {
      roster: { entries: Array<{ playerPoolEntry: { player: { stats: unknown[] } } }> };
    }
  ).roster.entries[0];
  first.playerPoolEntry.player.stats = [];
  const result = normalizePlayerPeriod({
    leagueId: "123",
    season: 2026,
    scoringPeriodId: 1,
    expectedTeamIds: ["1", "2"],
    payload,
    observedAt: "2026-10-08T00:00:00.000Z",
    transactionEvidenceStatus: "confirmed",
    lineupSlotCounts: null,
  });
  assert.equal(result.coverage.projectionEvidenceStatus, "unavailable");
  assert.deepEqual(result.entries.map((row) => row.projectedPoints), [null, null]);
});

test("rejects conflicting direct actual scores", () => {
  const first = entry(101, 11.25);
  const second = entry(202, 8.5);
  const payload = periodPayload({
    schedule: [
      { home: { rosterForCurrentScoringPeriod: { entries: [first] } } },
      {
        away: {
          rosterForCurrentScoringPeriod: { entries: [{ ...first, playerPoolEntry: { ...first.playerPoolEntry, appliedStatTotal: 12 } }, second] },
        },
      },
    ],
  });
  assert.throws(
    () =>
      normalizePlayerPeriod({
        leagueId: "123",
        season: 2026,
        scoringPeriodId: 1,
        expectedTeamIds: ["1", "2"],
        payload,
        observedAt: "2026-10-08T00:00:00.000Z",
        transactionEvidenceStatus: "confirmed",
        lineupSlotCounts: { "2": 1 },
      }),
    /conflicting player actual scores/,
  );
});

test("keeps unknown transaction codes unverified with provider identifiers", () => {
  const transactions = normalizeTransactions({
    leagueId: "123",
    season: 2026,
    observedAt: "2026-10-08T00:00:00.000Z",
    payload: {
      topics: [
        {
          id: 9,
          messages: [
            {
              id: 12,
              date: 1_760_000_000_000,
              messageTypeId: 77,
              assets: [{ id: 44, playerId: 99, teamId: 1, lineupSlotId: 2 }],
            },
          ],
        },
      ],
    },
  });
  assert.deepEqual(transactions.map((transaction) => transaction.providerEventId), ["9:12"]);
  assert.equal(transactions[0].normalizedType, null);
  assert.equal(transactions[0].evidenceStatus, "unverified");
  assert.deepEqual(transactions[0].assets.map((asset) => asset.providerAssetId), ["44"]);
});

test("fetches activity before it requests only ESPN-reported periods", async () => {
  process.env.ESPN_LEAGUE_ID = "123";
  process.env.ESPN_S2 = "fixture-s2";
  process.env.ESPN_SWID = "{fixture-swid}";
  const calls: string[] = [];
  global.fetch = async (input, init) => {
    const url = new URL(String(input));
    calls.push(`${url.pathname}:${url.searchParams.get("scoringPeriodId") ?? "summary"}`);
    if (url.pathname.endsWith("/communication/")) {
      const requestHeaders = new Headers(init?.headers);
      assert.ok(requestHeaders.has("x-fantasy-filter"));
      assert.equal(
        requestHeaders.get("Cookie"),
        "espn_s2=fixture-s2; SWID={fixture-swid}",
      );
      return Response.json({ topics: [] });
    }
    if (!url.searchParams.has("scoringPeriodId")) {
      return Response.json({
        seasonId: 2026,
        scoringPeriodId: 2,
        status: { firstScoringPeriod: 1, latestScoringPeriod: 2 },
        teams: [{ id: 1 }, { id: 2 }],
        settings: { rosterSettings: { lineupSlotCounts: { "2": 2 } } },
      });
    }
    const week = Number(url.searchParams.get("scoringPeriodId"));
    const payload = periodPayload({ scoringPeriodId: week });
    for (const team of payload.teams) {
      for (const row of (
        team as {
          roster: {
            entries: Array<{
              playerPoolEntry: { player: { stats: Array<{ scoringPeriodId: number }> } };
            }>;
          };
        }
      ).roster.entries) {
        row.playerPoolEntry.player.stats[0].scoringPeriodId = week;
      }
    }
    return Response.json(payload);
  };
  const result = await fetchCurrentPlayerImport({ season: 2026 });
  assert.equal(result.periods.length, 2);
  assert.equal(result.periods[0].coverage.lineupRuleEvidenceStatus, "unavailable");
  assert.equal(result.periods[1].coverage.lineupRuleEvidenceStatus, "confirmed");
  assert.equal(result.periods[0].coverage.transactionEvidenceStatus, "unverified");
  assert.equal(calls.length, 4);
  assert.ok(calls[0].endsWith("/communication/:summary"));
  assert.deepEqual(calls.map((call) => call.split(":").at(-1)), ["summary", "summary", "1", "2"]);
});

test("replaces a period and refreshes corrected scores without stale rows", async () => {
  const rows = new Map<string, Record<string, unknown>>();
  const from = (table: string) => {
    return {
      async upsert(value: Record<string, unknown> | Record<string, unknown>[]) {
        for (const row of Array.isArray(value) ? value : [value]) {
          const key = [table, row.league_id, row.season, row.scoring_period_id, row.espn_player_id ?? row.provider_event_id].join(":");
          rows.set(key, row);
        }
        return { error: null };
      },
    };
  };
  const rpc = async (_name: string, args: Record<string, unknown>) => {
    const coverage = args.p_coverage as Record<string, unknown>;
    for (const [key, row] of rows) {
      if (
        key.startsWith("player_week_entries:") &&
        row.league_id === coverage.league_id &&
        row.season === coverage.season &&
        row.scoring_period_id === coverage.scoring_period_id
      ) rows.delete(key);
    }
    for (const row of args.p_entries as Record<string, unknown>[]) {
      const key = ["player_week_entries", row.league_id, row.season, row.scoring_period_id, row.espn_player_id].join(":");
      rows.set(key, row);
    }
    return { error: null };
  };
  const data: CurrentPlayerImport = { leagueId: "123", season: 2026, periods: [normalized()], transactions: [] };
  await persistCurrentPlayerImport({ from, rpc } as never, data);
  data.periods[0].entries[0].actualPoints = 19.5;
  await persistCurrentPlayerImport({ from, rpc } as never, data);
  const entries = [...rows.entries()].filter(([key]) => key.startsWith("player_week_entries:"));
  assert.equal(entries.length, 2);
  assert.equal(entries.find(([, row]) => row.espn_player_id === 101)?.[1].actual_points, 19.5);
});

test("imports a bounded historical range with independent supported coverage", async () => {
  process.env.ESPN_LEAGUE_ID = "123";
  const requests: number[] = [];
  global.fetch = async (input) => {
    const url = new URL(String(input));
    const week = url.searchParams.get("scoringPeriodId");
    if (!week) {
      return Response.json({
        seasonId: 2020,
        scoringPeriodId: 18,
        status: { firstScoringPeriod: 1, latestScoringPeriod: 18 },
        teams: [{ id: 1 }, { id: 2 }],
      });
    }
    requests.push(Number(week));
    const payload = periodPayload({ seasonId: 2020, scoringPeriodId: Number(week) });
    for (const team of payload.teams) {
      for (const row of (
        team as { roster: { entries: Array<{ playerPoolEntry: { player: { stats: Array<{ scoringPeriodId: number }> } } }> } }
      ).roster.entries) {
        row.playerPoolEntry.player.stats[0].scoringPeriodId = Number(week);
      }
    }
    return Response.json(payload);
  };
  const result = await fetchHistoricalPlayerImport({
    season: 2020,
    firstScoringPeriod: 2,
    lastScoringPeriod: 3,
  });
  assert.ok(!("reason" in result));
  assert.deepEqual(requests, [2, 3]);
  assert.equal(result.periods.length, 2);
  for (const period of result.periods) {
    assert.equal(period.coverage.rosterEvidenceStatus, "confirmed");
    assert.equal(period.coverage.lineupEvidenceStatus, "confirmed");
    assert.equal(period.coverage.actualScoreEvidenceStatus, "confirmed");
    assert.equal(period.coverage.projectionEvidenceStatus, "confirmed");
    assert.equal(period.coverage.injuryEvidenceStatus, "unavailable");
    assert.equal(period.coverage.lineupRuleEvidenceStatus, "unavailable");
    assert.equal(period.coverage.transactionEvidenceStatus, "unavailable");
    assert.ok(period.entries.every((entry) => entry.eligibleLineupSlotIds === null));
    assert.ok(period.entries.every((entry) => entry.injuryDesignation === null));
  }
});

test("fails closed when a retained historical period omits an expected roster", async () => {
  process.env.ESPN_LEAGUE_ID = "123";
  global.fetch = async (input) => {
    const url = new URL(String(input));
    if (!url.searchParams.has("scoringPeriodId")) {
      return Response.json({
        seasonId: 2020,
        scoringPeriodId: 18,
        status: { firstScoringPeriod: 1, latestScoringPeriod: 18 },
        teams: [{ id: 1 }, { id: 2 }],
      });
    }
    return Response.json(periodPayload({
      seasonId: 2020,
      teams: [{ id: 1, roster: { entries: [entry(101, 11.25)] } }],
    }));
  };
  await assert.rejects(
    fetchHistoricalPlayerImport({ season: 2020, firstScoringPeriod: 1, lastScoringPeriod: 1 }),
    /every expected roster team/,
  );
});

test("reports 2017 as unavailable without requesting ESPN", async () => {
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    return Response.json({});
  };
  const result = await fetchHistoricalPlayerImport({ season: 2017 });
  assert.deepEqual(result, {
    leagueId: null,
    season: 2017,
    reason: "ESPN does not retain weekly roster or box-score evidence for 2017.",
  });
  assert.equal(calls, 0);
});
