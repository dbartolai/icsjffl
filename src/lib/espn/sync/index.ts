import "server-only";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { EspnError } from "../client";
import { importEspnSeasons, type SeasonImportResult } from "./history-import";
import {
  SupabaseSyncRunStore,
  type SyncFreshness,
  type SyncRunStore,
} from "./store";

const LOCK_TTL_MS = 10 * 60 * 1000;

export function resolveEspnSyncSeason(date = new Date()) {
  const year = date.getUTCFullYear();
  return date.getUTCMonth() < 2 ? year - 1 : year;
}

export type EspnSyncResult =
  | { status: "success"; freshness: SyncFreshness }
  | {
      status: "skipped";
      reason: "already_running";
      season: number;
      freshness: SyncFreshness | null;
    };

export class EspnSyncExecutionError extends Error {
  constructor() {
    super("ESPN synchronization failed.");
  }
}

function errorCode(error: unknown) {
  if (error instanceof EspnError) return "espn_error";
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return "database_error";
  }
  return "unexpected_error";
}

export async function runEspnSeasonSync(options: {
  leagueId: string;
  season: number;
  store: SyncRunStore;
  importSeason: () => Promise<SeasonImportResult>;
  now?: () => Date;
  newRunId?: () => string;
}): Promise<EspnSyncResult> {
  const now = options.now ?? (() => new Date());
  const startedAt = now();
  const claim = await options.store.claim({
    leagueId: options.leagueId,
    season: options.season,
    runId: (options.newRunId ?? randomUUID)(),
    startedAt: startedAt.toISOString(),
    lockExpiresAt: new Date(startedAt.getTime() + LOCK_TTL_MS).toISOString(),
    staleDurationMs: LOCK_TTL_MS,
  });
  if (claim.status === "busy") {
    return {
      status: "skipped",
      reason: "already_running",
      season: options.season,
      freshness: claim.freshness,
    };
  }

  try {
    const imported = await options.importSeason();
    if (
      imported.leagueId !== options.leagueId ||
      imported.season !== options.season
    ) {
      throw new Error("Imported season does not match the sync target.");
    }
    const finishedAt = now();
    const durationMs = Math.max(0, finishedAt.getTime() - startedAt.getTime());
    const freshness: SyncFreshness = {
      season: imported.season,
      syncedAt: finishedAt.toISOString(),
      durationMs,
      rows: imported.rows,
    };
    await options.store.succeed({
      runId: claim.runId,
      finishedAt: freshness.syncedAt,
      durationMs,
      rows: imported.rows,
    });
    return { status: "success", freshness };
  } catch (error) {
    const finishedAt = now();
    const durationMs = Math.max(0, finishedAt.getTime() - startedAt.getTime());
    try {
      await options.store.fail({
        runId: claim.runId,
        finishedAt: finishedAt.toISOString(),
        durationMs,
        errorCode: errorCode(error),
      });
    } catch {
      // The endpoint still returns one safe error if failure recording also fails.
    }
    throw new EspnSyncExecutionError();
  }
}

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new EspnSyncExecutionError();
  return value;
}

export async function syncCurrentSeason(): Promise<EspnSyncResult> {
  const leagueId = required("ESPN_LEAGUE_ID");
  if (!/^\d+$/.test(leagueId)) throw new EspnSyncExecutionError();
  const season = resolveEspnSyncSeason();
  const supabase = createClient(
    required("NEXT_PUBLIC_SUPABASE_URL"),
    required("SUPABASE_SECRET_KEY"),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
  return runEspnSeasonSync({
    leagueId,
    season,
    store: new SupabaseSyncRunStore(supabase),
    importSeason: async () => {
      const [result] = await importEspnSeasons({
        seasons: [season],
        supabase,
      });
      return result;
    },
  });
}
