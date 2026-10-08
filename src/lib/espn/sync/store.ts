import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SyncRowCounts } from "./history-import";

export type SyncFreshness = {
  season: number;
  syncedAt: string;
  durationMs: number;
  rows: SyncRowCounts;
};

export type SyncClaim =
  | { status: "acquired"; runId: string }
  | { status: "busy"; freshness: SyncFreshness | null };

export interface SyncRunStore {
  claim(input: {
    leagueId: string;
    season: number;
    runId: string;
    startedAt: string;
    lockExpiresAt: string;
    staleDurationMs: number;
  }): Promise<SyncClaim>;
  succeed(input: {
    runId: string;
    finishedAt: string;
    durationMs: number;
    rows: SyncRowCounts;
  }): Promise<void>;
  fail(input: {
    runId: string;
    finishedAt: string;
    durationMs: number;
    errorCode: string;
  }): Promise<void>;
}

type SyncRunRow = {
  season: number;
  finished_at: string;
  duration_ms: number;
  seasons_upserted: number;
  teams_upserted: number;
  games_upserted: number;
  snapshots_upserted: number;
};

export class SupabaseSyncRunStore implements SyncRunStore {
  constructor(private readonly supabase: SupabaseClient) {}

  private async latestSuccess(
    leagueId: string,
    season: number,
  ): Promise<SyncFreshness | null> {
    const result = await this.supabase
      .from("espn_sync_runs")
      .select(
        "season,finished_at,duration_ms,seasons_upserted,teams_upserted,games_upserted,snapshots_upserted",
      )
      .eq("league_id", leagueId)
      .eq("season", season)
      .eq("status", "success")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (result.error) throw result.error;
    const row = result.data as SyncRunRow | null;
    if (!row) return null;
    return {
      season: row.season,
      syncedAt: row.finished_at,
      durationMs: row.duration_ms,
      rows: {
        seasons: row.seasons_upserted,
        teams: row.teams_upserted,
        games: row.games_upserted,
        snapshots: row.snapshots_upserted,
      },
    };
  }

  async claim(input: {
    leagueId: string;
    season: number;
    runId: string;
    startedAt: string;
    lockExpiresAt: string;
    staleDurationMs: number;
  }): Promise<SyncClaim> {
    const expired = await this.supabase
      .from("espn_sync_runs")
      .update({
        status: "failed",
        finished_at: input.startedAt,
        duration_ms: input.staleDurationMs,
        error_code: "lock_expired",
      })
      .eq("league_id", input.leagueId)
      .eq("season", input.season)
      .eq("status", "running")
      .lte("lock_expires_at", input.startedAt);
    if (expired.error) throw expired.error;

    const claimed = await this.supabase.from("espn_sync_runs").insert({
      run_id: input.runId,
      league_id: input.leagueId,
      season: input.season,
      status: "running",
      started_at: input.startedAt,
      lock_expires_at: input.lockExpiresAt,
    });
    if (!claimed.error) return { status: "acquired", runId: input.runId };
    if (claimed.error.code !== "23505") throw claimed.error;
    return {
      status: "busy",
      freshness: await this.latestSuccess(input.leagueId, input.season),
    };
  }

  async succeed(input: {
    runId: string;
    finishedAt: string;
    durationMs: number;
    rows: SyncRowCounts;
  }) {
    const result = await this.supabase
      .from("espn_sync_runs")
      .update({
        status: "success",
        finished_at: input.finishedAt,
        lock_expires_at: null,
        duration_ms: input.durationMs,
        seasons_upserted: input.rows.seasons,
        teams_upserted: input.rows.teams,
        games_upserted: input.rows.games,
        snapshots_upserted: input.rows.snapshots,
        error_code: null,
      })
      .eq("run_id", input.runId)
      .eq("status", "running");
    if (result.error) throw result.error;
  }

  async fail(input: {
    runId: string;
    finishedAt: string;
    durationMs: number;
    errorCode: string;
  }) {
    const result = await this.supabase
      .from("espn_sync_runs")
      .update({
        status: "failed",
        finished_at: input.finishedAt,
        lock_expires_at: null,
        duration_ms: input.durationMs,
        error_code: input.errorCode,
      })
      .eq("run_id", input.runId)
      .eq("status", "running");
    if (result.error) throw result.error;
  }
}
