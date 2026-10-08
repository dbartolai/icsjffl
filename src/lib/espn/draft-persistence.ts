import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DraftHistoryRow } from "./draft-history";

type Query = PromiseLike<{ error: unknown }> & {
  delete: () => Query;
  eq: (column: string, value: string | number) => Query;
  upsert: (rows: unknown, options: { onConflict: string }) => Promise<{ error: unknown }>;
};

export type DraftHistoryStore = {
  from: (table: "players" | "league_draft_picks") => Query;
};

export type DraftImportCounts = {
  players: number;
  picks: number;
  seasons: number;
};

function throwIfError(result: { error: unknown }) {
  if (result.error) throw result.error;
}

function playerRows(rows: readonly DraftHistoryRow[]) {
  const players = new Map<number, { player: DraftHistoryRow["player"]; firstSeenSeason: number }>();
  for (const row of rows) {
    const existing = players.get(row.espnPlayerId);
    if (!existing || row.player.source.season > existing.player.source.season) {
      players.set(row.espnPlayerId, {
        player: row.player,
        firstSeenSeason: Math.min(existing?.firstSeenSeason ?? row.player.source.season, row.player.source.season),
      });
    } else {
      existing.firstSeenSeason = Math.min(existing.firstSeenSeason, row.player.source.season);
    }
  }
  return [...players.values()].map(({ player, firstSeenSeason }) => ({
    espn_player_id: player.espnPlayerId,
    display_name: player.displayName,
    default_position_id: player.defaultPositionId,
    first_seen_season: firstSeenSeason,
    last_seen_season: player.source.season,
    source: player.source.source,
    source_checksum: player.source.sourceChecksum,
    observed_at: player.source.observedAt,
    evidence_status: player.source.evidenceStatus,
  }));
}

function pickRows(rows: readonly DraftHistoryRow[]) {
  return rows.map((row) => ({
    league_id: row.leagueId,
    season: row.season,
    team_id: row.teamId,
    espn_player_id: row.espnPlayerId,
    round: row.round,
    round_pick: row.roundPick,
    overall_pick: row.overallPick,
    source: row.source.source,
    source_checksum: row.source.sourceChecksum,
    observed_at: row.source.observedAt,
    evidence_status: row.source.evidenceStatus,
  }));
}

function validateSeason(rows: readonly DraftHistoryRow[], expectedPickCount: number) {
  if (rows.length !== expectedPickCount) {
    throw new Error("Draft import will not persist an incomplete season.");
  }
  const overallPicks = new Set(rows.map((row) => row.overallPick));
  const roundPicks = new Set(rows.map((row) => `${row.round}:${row.roundPick}`));
  const players = new Set(rows.map((row) => row.espnPlayerId));
  if (
    overallPicks.size !== rows.length ||
    roundPicks.size !== rows.length ||
    players.size !== rows.length
  ) {
    throw new Error("Draft import has duplicate natural keys.");
  }
}

export async function persistDraftHistory(
  store: DraftHistoryStore | SupabaseClient,
  rows: readonly DraftHistoryRow[],
  options: { expectedPickCount: number },
): Promise<DraftImportCounts> {
  if (!Number.isInteger(options.expectedPickCount) || options.expectedPickCount < 1) {
    throw new Error("Draft import requires a positive expected pick count.");
  }
  const seasons = new Map<string, DraftHistoryRow[]>();
  for (const row of rows) {
    const key = `${row.leagueId}:${row.season}`;
    const seasonRows = seasons.get(key) ?? [];
    seasonRows.push(row);
    seasons.set(key, seasonRows);
  }
  if (!seasons.size) throw new Error("Draft import has no seasons to persist.");
  for (const seasonRows of seasons.values()) validateSeason(seasonRows, options.expectedPickCount);

  const draftStore = store as DraftHistoryStore;
  const players = playerRows(rows);
  for (let offset = 0; offset < players.length; offset += 250) {
    throwIfError(
      await draftStore.from("players").upsert(players.slice(offset, offset + 250), {
        onConflict: "espn_player_id",
      }),
    );
  }

  for (const seasonRows of seasons.values()) {
    const { leagueId, season } = seasonRows[0];
    throwIfError(
      await draftStore
        .from("league_draft_picks")
        .delete()
        .eq("league_id", leagueId)
        .eq("season", season),
    );
    throwIfError(
      await draftStore.from("league_draft_picks").upsert(pickRows(seasonRows), {
        onConflict: "league_id,season,overall_pick",
      }),
    );
  }

  return { players: players.length, picks: rows.length, seasons: seasons.size };
}
