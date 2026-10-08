import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CurrentPlayerImport,
  PlayerCoverage,
  PlayerIdentity,
  PlayerImportCounts,
  PlayerPeriod,
  Transaction,
} from "./types";

type Query = PromiseLike<{ error: unknown }> & {
  upsert: (rows: unknown, options: { onConflict: string }) => Promise<{ error: unknown }>;
};

export type PlayerImportStore = {
  from: (table: string) => Query;
  rpc: (
    functionName: string,
    arguments_: Record<string, unknown>,
  ) => Promise<{ error: unknown }>;
};

function error(result: { error: unknown }) {
  if (result.error) throw result.error;
}

function playerRow(player: PlayerIdentity) {
  return {
    espn_player_id: player.espnPlayerId,
    display_name: player.displayName,
    default_position_id: player.defaultPositionId,
    first_seen_season: player.season,
    last_seen_season: player.season,
    source: player.source,
    source_checksum: player.sourceChecksum,
    observed_at: player.observedAt,
    evidence_status: "confirmed",
  };
}

function coverageRow(coverage: PlayerCoverage) {
  return {
    league_id: coverage.leagueId,
    season: coverage.season,
    scoring_period_id: coverage.scoringPeriodId,
    roster_evidence_status: coverage.rosterEvidenceStatus,
    lineup_evidence_status: coverage.lineupEvidenceStatus,
    actual_score_evidence_status: coverage.actualScoreEvidenceStatus,
    projection_evidence_status: coverage.projectionEvidenceStatus,
    injury_evidence_status: coverage.injuryEvidenceStatus,
    transaction_evidence_status: coverage.transactionEvidenceStatus,
    lineup_rule_evidence_status: coverage.lineupRuleEvidenceStatus,
    lineup_slot_counts: coverage.lineupSlotCounts,
    reason: coverage.reason,
    source: coverage.source,
    source_checksum: coverage.sourceChecksum,
    observed_at: coverage.observedAt,
  };
}

function entryRows(period: PlayerPeriod) {
  return period.entries.map((entry) => ({
    league_id: entry.leagueId,
    season: entry.season,
    scoring_period_id: entry.scoringPeriodId,
    team_id: entry.teamId,
    espn_player_id: entry.espnPlayerId,
    nfl_team_id: entry.nflTeamId,
    lineup_slot_id: entry.lineupSlotId,
    actual_points: entry.actualPoints,
    projected_points: entry.projectedPoints,
    projection_source_id: entry.projectionSourceId,
    projection_split_type_id: entry.projectionSplitTypeId,
    injury_designation: entry.injuryDesignation,
    is_injured: entry.isInjured,
    roster_evidence_status: entry.rosterEvidenceStatus,
    lineup_evidence_status: entry.lineupEvidenceStatus,
    actual_score_evidence_status: entry.actualScoreEvidenceStatus,
    projection_evidence_status: entry.projectionEvidenceStatus,
    injury_evidence_status: entry.injuryEvidenceStatus,
    eligibility_evidence_status: entry.eligibilityEvidenceStatus,
    eligible_lineup_slot_ids: entry.eligibleLineupSlotIds,
    source: entry.source,
    source_checksum: entry.sourceChecksum,
    observed_at: entry.observedAt,
  }));
}

async function upsertPlayers(store: PlayerImportStore, input: CurrentPlayerImport) {
  const players = new Map<number, PlayerIdentity>();
  for (const period of input.periods) {
    for (const entry of period.entries) players.set(entry.espnPlayerId, entry);
  }
  for (let offset = 0; offset < players.size; offset += 250) {
    const rows = [...players.values()].slice(offset, offset + 250).map(playerRow);
    error(
      await store.from("players").upsert(rows, { onConflict: "espn_player_id" }),
    );
  }
  return players.size;
}

async function replacePeriod(store: PlayerImportStore, period: PlayerPeriod) {
  error(
    await store.rpc("replace_player_period_snapshot", {
      p_coverage: coverageRow(period.coverage),
      p_entries: entryRows(period),
    }),
  );
}

function transactionRows(transaction: Transaction, knownPlayerIds: ReadonlySet<number>) {
  return {
    transaction: {
      league_id: transaction.leagueId,
      season: transaction.season,
      provider_event_id: transaction.providerEventId,
      event_at: transaction.eventAt,
      provider_type_code: transaction.providerTypeCode,
      normalized_type: null,
      evidence_status: transaction.evidenceStatus,
      source: transaction.source,
      source_checksum: transaction.sourceChecksum,
      observed_at: transaction.observedAt,
    },
    assets: transaction.assets.map((asset) => ({
      league_id: transaction.leagueId,
      season: transaction.season,
      provider_event_id: transaction.providerEventId,
      provider_asset_id: asset.providerAssetId,
      provider_espn_player_id: asset.espnPlayerId,
      espn_player_id:
        asset.espnPlayerId !== null && knownPlayerIds.has(asset.espnPlayerId)
          ? asset.espnPlayerId
          : null,
      team_id: asset.teamId,
      lineup_slot_id: asset.lineupSlotId,
      source: asset.source,
      source_checksum: asset.sourceChecksum,
      observed_at: asset.observedAt,
      evidence_status: asset.evidenceStatus,
    })),
  };
}

async function upsertTransactions(
  store: PlayerImportStore,
  transactions: Transaction[],
  knownPlayerIds: ReadonlySet<number>,
) {
  let assetCount = 0;
  for (const transaction of transactions) {
    const rows = transactionRows(transaction, knownPlayerIds);
    error(
      await store.from("transactions").upsert(rows.transaction, {
        onConflict: "league_id,season,provider_event_id",
      }),
    );
    if (rows.assets.length) {
      error(
        await store.from("transaction_assets").upsert(rows.assets, {
          onConflict: "league_id,season,provider_event_id,provider_asset_id",
        }),
      );
      assetCount += rows.assets.length;
    }
  }
  return assetCount;
}

export async function persistCurrentPlayerImport(
  store: PlayerImportStore | SupabaseClient,
  input: CurrentPlayerImport,
): Promise<PlayerImportCounts> {
  const playerStore = store as PlayerImportStore;
  const players = await upsertPlayers(playerStore, input);
  const knownPlayerIds = new Set(
    input.periods.flatMap((period) =>
      period.entries.map((entry) => entry.espnPlayerId),
    ),
  );
  const transactionAssets = await upsertTransactions(
    playerStore,
    input.transactions,
    knownPlayerIds,
  );
  for (const period of input.periods) await replacePeriod(playerStore, period);
  return {
    players,
    periods: input.periods.length,
    playerWeekEntries: input.periods.reduce(
      (count, period) => count + period.entries.length,
      0,
    ),
    transactions: input.transactions.length,
    transactionAssets,
  };
}
