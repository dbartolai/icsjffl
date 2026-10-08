import { createHash } from "node:crypto";
import type {
  CurrentPlayerImport,
  EvidenceStatus,
  PlayerCoverage,
  PlayerPeriod,
  PlayerWeekEntry,
  Transaction,
} from "./types";

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function array(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function number(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function string(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function identifier(value: unknown) {
  const text = string(value);
  if (text) return text;
  const numeric = number(value);
  return numeric === null ? null : String(numeric);
}

function boolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function checksum(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function playerFor(entry: JsonObject) {
  return object(object(entry.playerPoolEntry)?.player);
}

function playerId(entry: JsonObject) {
  return number(entry.playerId) ?? number(object(entry.playerPoolEntry)?.id);
}

function projectionFor(player: JsonObject, scoringPeriodId: number) {
  return array(player.stats)
    .map(object)
    .find(
      (stat) =>
        stat !== null &&
        number(stat.scoringPeriodId) === scoringPeriodId &&
        number(stat.statSourceId) === 1 &&
        number(stat.statSplitTypeId) === 1 &&
        number(stat.appliedTotal) !== null,
    );
}

function unavailable(): EvidenceStatus {
  return "unavailable";
}

type RosterObservation = {
  teamId: string;
  entry: JsonObject;
  player: JsonObject;
  espnPlayerId: number;
  displayName: string;
};

function rosterObservations(payload: JsonObject, expectedTeamIds: readonly string[]) {
  const expected = new Set(expectedTeamIds);
  const seenTeams = new Set<string>();
  const observedPlayers = new Set<number>();
  const observations: RosterObservation[] = [];

  for (const rawTeam of array(payload.teams)) {
    const team = object(rawTeam);
    const teamId = number(team?.id);
    if (teamId === null || !expected.has(String(teamId))) continue;
    const id = String(teamId);
    if (seenTeams.has(id)) throw new Error("ESPN repeated a roster team.");
    seenTeams.add(id);
    const entries = array(object(team?.roster)?.entries).map(object);
    if (!entries.length) throw new Error("ESPN returned an empty roster.");
    for (const entry of entries) {
      const player = entry ? playerFor(entry) : null;
      const id = entry ? playerId(entry) : null;
      const displayName = player ? string(player.fullName) : null;
      if (!entry || !player || id === null || !displayName) {
        throw new Error("ESPN returned an incomplete roster player.");
      }
      if (observedPlayers.has(id)) {
        throw new Error("ESPN assigned one player to multiple teams.");
      }
      observedPlayers.add(id);
      observations.push({
        teamId: String(teamId),
        entry,
        player,
        espnPlayerId: id,
        displayName,
      });
    }
  }
  if (seenTeams.size !== expected.size) {
    throw new Error("ESPN did not return every expected roster team.");
  }
  return observations;
}

function actualPoints(payload: JsonObject) {
  const values = new Map<number, number>();
  for (const matchupValue of array(payload.schedule)) {
    const matchup = object(matchupValue);
    for (const side of ["home", "away"] as const) {
      const roster = object(object(matchup?.[side])?.rosterForCurrentScoringPeriod);
      for (const entryValue of array(roster?.entries)) {
        const entry = object(entryValue);
        const id = entry ? playerId(entry) : null;
        const points = number(object(entry?.playerPoolEntry)?.appliedStatTotal);
        if (id === null || points === null) continue;
        if (values.has(id) && values.get(id) !== points) {
          throw new Error("ESPN returned conflicting player actual scores.");
        }
        values.set(id, points);
      }
    }
  }
  return values;
}

export function normalizePlayerPeriod(input: {
  leagueId: string;
  season: number;
  scoringPeriodId: number;
  expectedTeamIds: readonly string[];
  payload: unknown;
  observedAt: string;
  transactionEvidenceStatus: EvidenceStatus;
  lineupSlotCounts: Record<string, number> | null;
  suppressHistoricalFields?: boolean;
}): PlayerPeriod {
  if (input.season < 2018) throw new Error("2017 weekly player imports are unavailable.");
  if (!Number.isInteger(input.scoringPeriodId) || input.scoringPeriodId < 1) {
    throw new Error("The scoring period is invalid.");
  }
  const payload = object(input.payload);
  if (!payload || number(payload.seasonId) !== input.season) {
    throw new Error("ESPN returned a player period for another season.");
  }
  if (number(payload.scoringPeriodId) !== input.scoringPeriodId) {
    throw new Error("ESPN returned a player period for another week.");
  }
  const roster = rosterObservations(payload, input.expectedTeamIds);
  const actual = actualPoints(payload);
  const hasLineups = roster.every((row) => number(row.entry.lineupSlotId) !== null);
  const hasActuals = roster.every((row) => actual.has(row.espnPlayerId));
  const hasProjections = roster.every((row) => projectionFor(row.player, input.scoringPeriodId));
  const hasInjuries = !input.suppressHistoricalFields && roster.every(
    (row) =>
      string(row.player.injuryStatus) !== null && boolean(row.player.injured) !== null,
  );
  const hasEligibleSlots = !input.suppressHistoricalFields && roster.every(
    (row) =>
      Array.isArray(row.player.eligibleSlots) &&
      array(row.player.eligibleSlots).every((slot) => number(slot) !== null),
  );
  const hasLineupRules =
    input.lineupSlotCounts !== null &&
    Object.keys(input.lineupSlotCounts).length > 0 &&
    Object.values(input.lineupSlotCounts).every((count) => Number.isInteger(count) && count >= 0);
  const sourceChecksum = checksum({
    scoringPeriodId: input.scoringPeriodId,
    roster: roster.map((row) => ({
      teamId: row.teamId,
      playerId: row.espnPlayerId,
      lineupSlotId: number(row.entry.lineupSlotId),
      actualPoints: actual.get(row.espnPlayerId) ?? null,
      projection: projectionFor(row.player, input.scoringPeriodId),
      injuryStatus: string(row.player.injuryStatus),
      injured: boolean(row.player.injured),
    })),
  });
  const lineupEvidenceStatus: EvidenceStatus = hasLineups ? "confirmed" : unavailable();
  const actualScoreEvidenceStatus: EvidenceStatus = hasActuals
    ? "confirmed"
    : unavailable();
  const projectionEvidenceStatus: EvidenceStatus = hasProjections
    ? "confirmed"
    : unavailable();
  const injuryEvidenceStatus: EvidenceStatus = hasInjuries
    ? "unverified"
    : unavailable();
  const eligibilityEvidenceStatus: EvidenceStatus = hasEligibleSlots
    ? "confirmed"
    : unavailable();
  const entries: PlayerWeekEntry[] = roster.map((row) => {
    const projection = projectionFor(row.player, input.scoringPeriodId);
    return {
      leagueId: input.leagueId,
      season: input.season,
      scoringPeriodId: input.scoringPeriodId,
      teamId: row.teamId,
      espnPlayerId: row.espnPlayerId,
      displayName: row.displayName,
      defaultPositionId: number(row.player.defaultPositionId),
      nflTeamId: number(row.player.proTeamId),
      lineupSlotId: hasLineups ? number(row.entry.lineupSlotId) : null,
      actualPoints: hasActuals ? actual.get(row.espnPlayerId) ?? null : null,
      projectedPoints: hasProjections ? number(projection?.appliedTotal) : null,
      projectionSourceId: hasProjections ? 1 : null,
      projectionSplitTypeId: hasProjections ? 1 : null,
      injuryDesignation: hasInjuries ? string(row.player.injuryStatus) : null,
      isInjured: hasInjuries ? boolean(row.player.injured) : null,
      eligibilityEvidenceStatus,
      eligibleLineupSlotIds: hasEligibleSlots
        ? array(row.player.eligibleSlots).map((slot) => number(slot)!)
        : null,
      rosterEvidenceStatus: "confirmed",
      lineupEvidenceStatus,
      actualScoreEvidenceStatus,
      projectionEvidenceStatus,
      injuryEvidenceStatus,
      observedAt: input.observedAt,
      source: "espn:mRoster,mBoxscore",
      sourceChecksum,
    };
  });
  const coverage: PlayerCoverage = {
    leagueId: input.leagueId,
    season: input.season,
    scoringPeriodId: input.scoringPeriodId,
    rosterEvidenceStatus: "confirmed",
    lineupEvidenceStatus,
    actualScoreEvidenceStatus,
    projectionEvidenceStatus,
    injuryEvidenceStatus,
    transactionEvidenceStatus: input.transactionEvidenceStatus,
    lineupRuleEvidenceStatus: hasLineupRules ? "confirmed" : unavailable(),
    lineupSlotCounts: hasLineupRules ? input.lineupSlotCounts : null,
    reason: hasActuals
      ? "Complete direct roster and box-score response."
      : "Complete direct roster response. ESPN did not return every actual score.",
    source: "espn:mRoster,mBoxscore",
    sourceChecksum,
    observedAt: input.observedAt,
  };
  return { coverage, entries };
}

export function normalizeTransactions(input: {
  leagueId: string;
  season: number;
  payload: unknown;
  observedAt: string;
}): Transaction[] {
  const payload = object(input.payload);
  const transactions: Transaction[] = [];
  for (const topicValue of array(payload?.topics)) {
    const topic = object(topicValue);
    const topicId = identifier(topic?.id);
    if (!topicId || !Array.isArray(topic?.messages)) {
      throw new Error("ESPN returned an incomplete transaction topic.");
    }
    for (const messageValue of topic.messages) {
      const message = object(messageValue);
      const messageId = identifier(message?.id);
      const date = number(message?.date);
      const type = number(message?.messageTypeId);
      if (!message || !messageId || date === null || type === null) {
        throw new Error("ESPN returned an incomplete transaction message.");
      }
      const sourceChecksum = checksum({ topicId, message });
      const assets = array(message.assets).flatMap((assetValue) => {
        const asset = object(assetValue);
        const assetId = identifier(asset?.id);
        const playerId = number(asset?.playerId);
        const teamId = identifier(asset?.teamId);
        const lineupSlotId = number(asset?.lineupSlotId);
        if (!assetId || (playerId === null && !teamId && lineupSlotId === null)) return [];
        return [{
          providerAssetId: assetId,
          espnPlayerId: playerId,
          teamId,
          lineupSlotId,
          source: "espn:kona_league_communication",
          sourceChecksum,
          observedAt: input.observedAt,
          evidenceStatus: "unverified" as const,
        }];
      });
      transactions.push({
        leagueId: input.leagueId,
        season: input.season,
        providerEventId: `${topicId}:${messageId}`,
        eventAt: new Date(date).toISOString(),
        providerTypeCode: String(type),
        normalizedType: null,
        evidenceStatus: "unverified",
        source: "espn:kona_league_communication",
        sourceChecksum,
        observedAt: input.observedAt,
        assets,
      });
    }
  }
  return transactions;
}

export function buildCurrentPlayerImport(input: {
  leagueId: string;
  season: number;
  periods: PlayerPeriod[];
  transactions: Transaction[];
}): CurrentPlayerImport {
  return input;
}
