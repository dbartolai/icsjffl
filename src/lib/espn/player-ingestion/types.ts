export type EvidenceStatus =
  | "confirmed"
  | "unverified"
  | "inferred"
  | "unavailable";

export type PlayerIdentity = {
  espnPlayerId: number;
  displayName: string;
  defaultPositionId: number | null;
  season: number;
  observedAt: string;
  source: string;
  sourceChecksum: string;
};

export type PlayerWeekEntry = PlayerIdentity & {
  leagueId: string;
  scoringPeriodId: number;
  teamId: string;
  nflTeamId: number | null;
  lineupSlotId: number | null;
  actualPoints: number | null;
  projectedPoints: number | null;
  projectionSourceId: number | null;
  projectionSplitTypeId: number | null;
  injuryDesignation: string | null;
  isInjured: boolean | null;
  rosterEvidenceStatus: "confirmed";
  lineupEvidenceStatus: EvidenceStatus;
  actualScoreEvidenceStatus: EvidenceStatus;
  projectionEvidenceStatus: EvidenceStatus;
  injuryEvidenceStatus: EvidenceStatus;
  eligibilityEvidenceStatus: EvidenceStatus;
  eligibleLineupSlotIds: number[] | null;
};

export type PlayerCoverage = {
  leagueId: string;
  season: number;
  scoringPeriodId: number;
  rosterEvidenceStatus: EvidenceStatus;
  lineupEvidenceStatus: EvidenceStatus;
  actualScoreEvidenceStatus: EvidenceStatus;
  projectionEvidenceStatus: EvidenceStatus;
  injuryEvidenceStatus: EvidenceStatus;
  transactionEvidenceStatus: EvidenceStatus;
  lineupRuleEvidenceStatus: EvidenceStatus;
  lineupSlotCounts: Record<string, number> | null;
  reason: string;
  source: string;
  sourceChecksum: string;
  observedAt: string;
};

export type TransactionAsset = {
  providerAssetId: string;
  espnPlayerId: number | null;
  teamId: string | null;
  lineupSlotId: number | null;
  source: string;
  sourceChecksum: string;
  observedAt: string;
  evidenceStatus: "confirmed" | "unverified";
};

export type Transaction = {
  leagueId: string;
  season: number;
  providerEventId: string;
  eventAt: string;
  providerTypeCode: string;
  normalizedType: null;
  evidenceStatus: "unverified";
  source: string;
  sourceChecksum: string;
  observedAt: string;
  assets: TransactionAsset[];
};

export type PlayerPeriod = {
  coverage: PlayerCoverage;
  entries: PlayerWeekEntry[];
};

export type CurrentPlayerImport = {
  leagueId: string;
  season: number;
  periods: PlayerPeriod[];
  transactions: Transaction[];
};

export type PlayerImportCounts = {
  players: number;
  periods: number;
  playerWeekEntries: number;
  transactions: number;
  transactionAssets: number;
};
