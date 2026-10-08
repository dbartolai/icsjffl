import assert from "node:assert/strict";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { EspnError } from "../src/lib/espn/client";
import type { HistoricalSeason } from "../src/lib/espn/history-types";
import { createEspnSyncHandler } from "../src/lib/espn/sync/handler";
import { upsertSeason } from "../src/lib/espn/sync/history-import";
import {
  EspnSyncExecutionError,
  runEspnSeasonSync,
} from "../src/lib/espn/sync";
import type {
  SyncClaim,
  SyncRunStore,
} from "../src/lib/espn/sync/store";

const freshness = {
  season: 2026,
  syncedAt: "2026-10-07T18:00:01.000Z",
  durationMs: 1000,
  rows: { seasons: 1, teams: 2, games: 1, snapshots: 1 },
};

function request(token?: string) {
  return new Request("http://localhost/api/cron/espn-sync", {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
}

test("cron route requires its own bearer secret", async () => {
  let syncCalls = 0;
  const handler = createEspnSyncHandler({
    cronSecret: "cron-secret-value",
    sync: async () => {
      syncCalls += 1;
      return { status: "success", freshness };
    },
  });

  for (const input of [request(), request("wrong-secret")]) {
    const response = await handler(input);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "Unauthorized." });
  }
  assert.equal(syncCalls, 0);

  const response = await handler(request("cron-secret-value"));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, "success");
  assert.equal(syncCalls, 1);
});

test("cron route returns safe configuration and execution errors", async () => {
  const unconfigured = createEspnSyncHandler({
    cronSecret: undefined,
    sync: async () => ({ status: "success", freshness }),
  });
  const configResponse = await unconfigured(request());
  assert.equal(configResponse.status, 500);
  assert.equal(
    JSON.stringify(await configResponse.json()).includes("secret"),
    false,
  );

  const failing = createEspnSyncHandler({
    cronSecret: "cron-secret-value",
    sync: async () => {
      throw new Error("espn_s2=do-not-expose database details");
    },
  });
  const failureResponse = await failing(request("cron-secret-value"));
  const body = await failureResponse.text();
  assert.equal(failureResponse.status, 500);
  assert.equal(body.includes("espn_s2"), false);
  assert.equal(body.includes("database details"), false);
  assert.equal(failureResponse.headers.get("Cache-Control"), "private, no-store");
});

class MemoryRunStore implements SyncRunStore {
  active = false;
  failureCode: string | null = null;

  async claim(): Promise<SyncClaim> {
    if (this.active) return { status: "busy", freshness: null };
    this.active = true;
    return { status: "acquired", runId: "run-1" };
  }

  async succeed() {
    this.active = false;
  }

  async fail(input: { errorCode: string }) {
    this.active = false;
    this.failureCode = input.errorCode;
  }
}

test("overlapping runs skip safely and import only once", async () => {
  const store = new MemoryRunStore();
  let importCalls = 0;
  let releaseImport!: () => void;
  const importBlocked = new Promise<void>((resolve) => {
    releaseImport = resolve;
  });
  const run = () =>
    runEspnSeasonSync({
      leagueId: "123",
      season: 2026,
      store,
      newRunId: () => "run-1",
      importSeason: async () => {
        importCalls += 1;
        await importBlocked;
        return { leagueId: "123", season: 2026, rows: freshness.rows };
      },
    });

  const first = run();
  await Promise.resolve();
  const second = await run();
  assert.deepEqual(second, {
    status: "skipped",
    reason: "already_running",
    season: 2026,
    freshness: null,
  });
  assert.equal(importCalls, 1);

  releaseImport();
  assert.equal((await first).status, "success");
  assert.equal(store.active, false);
});

test("failed imports record a safe error code", async () => {
  const store = new MemoryRunStore();
  await assert.rejects(
    runEspnSeasonSync({
      leagueId: "123",
      season: 2026,
      store,
      importSeason: async () => {
        throw new EspnError("secret ESPN cookie details");
      },
    }),
    EspnSyncExecutionError,
  );
  assert.equal(store.failureCode, "espn_error");
  assert.equal(store.failureCode?.includes("secret"), false);
});

test("season writes are idempotent upserts", async () => {
  const stored = new Map<string, unknown>();
  const conflicts: Record<string, string> = {};
  const fakeSupabase = {
    from(table: string) {
      return {
        async upsert(
          value: Record<string, unknown> | Record<string, unknown>[],
          options: { onConflict: string },
        ) {
          conflicts[table] = options.onConflict;
          const rows = Array.isArray(value) ? value : [value];
          const keys = options.onConflict.split(",");
          for (const row of rows) {
            const key = keys.map((column) => row[column]).join(":");
            stored.set(`${table}:${key}`, row);
          }
          return { error: null };
        },
      };
    },
  } as unknown as SupabaseClient;
  const season: HistoricalSeason = {
    leagueId: "123",
    leagueName: "Fixture League",
    season: 2026,
    managers: [{ id: "owner", displayName: "Test Manager" }],
    teams: [
      {
        id: "1",
        season: 2026,
        name: "First",
        abbreviation: "FIR",
        managerIds: ["owner"],
        wins: 1,
        losses: 0,
        ties: 0,
        pointsFor: 100,
        pointsAgainst: 90,
        finalRank: null,
      },
      {
        id: "2",
        season: 2026,
        name: "Second",
        abbreviation: "SEC",
        managerIds: [],
        wins: 0,
        losses: 1,
        ties: 0,
        pointsFor: 90,
        pointsAgainst: 100,
        finalRank: null,
      },
    ],
    matchups: [
      {
        id: "2026-1-10",
        season: 2026,
        week: 1,
        matchupPeriod: 1,
        homeTeamId: "1",
        awayTeamId: "2",
        homeScore: 100,
        awayScore: 90,
        isPlayoff: false,
      },
    ],
    draftPicks: [],
    championTeamId: null,
  };

  await upsertSeason(fakeSupabase, season);
  await upsertSeason(fakeSupabase, season);

  assert.equal(stored.size, 5);
  assert.deepEqual(conflicts, {
    league_seasons: "league_id,season",
    league_teams: "league_id,season,team_id",
    league_games: "league_id,season,game_id,week",
    espn_season_snapshots: "league_id,season",
  });
});
