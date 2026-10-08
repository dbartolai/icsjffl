import { createHash } from "node:crypto";

type JsonObject = Record<string, unknown>;

type SeasonAudit = {
  season: number;
  endpoint: "legacy" | "season";
  weeksRequested: number;
  distinctRosterSnapshots: number;
  weeklyRosterWeeks: number;
  playerIdentityWeeks: number;
  lineupSlotWeeks: number;
  weeklyBoxscoreWeeks: number;
  actualScoreWeeks: number;
  projectionWeeks: number;
  injuryStatusWeeks: number;
  acquisitionMetadataWeeks: number;
  multiWeekMatchupPeriods: number;
  draftPicks: number;
  resolvedDraftPlayers: number;
  acquisitionTypes: string[];
  transactionFeedStatus: number;
  transactionTopics: number;
  transactionMessages: number;
  transactionTimestampMessages: number;
  transactionMessageTypes: number[];
};

const DEFAULT_FIRST_SEASON = 2017;
const DEFAULT_LAST_SEASON = 2026;
const REQUEST_TIMEOUT_MS = 15_000;

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function string(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Set ${name} before running the ESPN audit.`);
  if (/[;\r\n]/.test(value)) throw new Error(`${name} has an invalid format.`);
  return value;
}

function seasonRange() {
  const first = Number(
    process.env.ESPN_AUDIT_START_SEASON ?? DEFAULT_FIRST_SEASON,
  );
  const last = Number(process.env.ESPN_AUDIT_END_SEASON ?? DEFAULT_LAST_SEASON);
  if (!Number.isInteger(first) || !Number.isInteger(last) || first > last) {
    throw new Error("The ESPN audit season range is invalid.");
  }
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}

function leagueUrl(leagueId: string, season: number) {
  if (season < 2018) {
    const url = new URL(
      `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/leagueHistory/${leagueId}`,
    );
    url.searchParams.set("seasonId", String(season));
    return url;
  }
  return new URL(
    `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${leagueId}`,
  );
}

function unwrap(payload: unknown) {
  return object(Array.isArray(payload) ? payload[0] : payload);
}

function signature(rows: unknown[]) {
  return createHash("sha256")
    .update(JSON.stringify(rows))
    .digest("hex")
    .slice(0, 16);
}

async function fetchJson(
  url: URL,
  headers: HeadersInit,
  allowedStatuses: readonly number[] = [200],
) {
  const response = await fetch(url, {
    headers,
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!allowedStatuses.includes(response.status)) {
    throw new Error(`ESPN returned HTTP ${response.status}.`);
  }
  return { status: response.status, payload: await response.json() };
}

function rosterEntries(payload: JsonObject | null) {
  return array(payload?.teams).flatMap((teamValue) => {
    const team = object(teamValue);
    const roster = object(team?.roster);
    return array(roster?.entries).map((entryValue) => ({
      teamId: number(team?.id),
      entry: object(entryValue),
    }));
  });
}

function boxscoreEntries(payload: JsonObject | null) {
  return array(payload?.schedule).flatMap((matchupValue) => {
    const matchup = object(matchupValue);
    return ["home", "away"].flatMap((side) => {
      const score = object(matchup?.[side]);
      const roster = object(score?.rosterForCurrentScoringPeriod);
      return array(roster?.entries).map((entryValue) => ({
        teamId: number(score?.teamId),
        entry: object(entryValue),
      }));
    });
  });
}

function playerFromEntry(entry: JsonObject | null) {
  return object(object(entry?.playerPoolEntry)?.player);
}

function playerId(entry: JsonObject | null) {
  return number(entry?.playerId) ?? number(object(entry?.playerPoolEntry)?.id);
}

function hasWeekProjection(player: JsonObject | null, week: number) {
  return array(player?.stats).some((statValue) => {
    const stat = object(statValue);
    return (
      number(stat?.scoringPeriodId) === week &&
      number(stat?.statSourceId) === 1 &&
      number(stat?.statSplitTypeId) === 1 &&
      number(stat?.appliedTotal) !== null
    );
  });
}

function draftPicks(payload: JsonObject | null) {
  return array(object(payload?.draftDetail)?.picks)
    .map(object)
    .filter((pick): pick is JsonObject => pick !== null);
}

function matchupPeriodStats(payload: JsonObject | null) {
  const settings = object(payload?.settings);
  const scheduleSettings = object(settings?.scheduleSettings);
  const periods = object(scheduleSettings?.matchupPeriods);
  return Object.values(periods ?? {}).filter(
    (weeks) => Array.isArray(weeks) && weeks.length > 1,
  ).length;
}

async function resolveDraftPlayers(
  leagueId: string,
  season: number,
  ids: number[],
  headers: HeadersInit,
) {
  let resolved = 0;
  for (let offset = 0; offset < ids.length; offset += 50) {
    const batch = ids.slice(offset, offset + 50);
    const url = leagueUrl(leagueId, season);
    url.searchParams.append("view", "kona_player_info");
    const result = await fetchJson(url, {
      ...headers,
      "x-fantasy-filter": JSON.stringify({
        players: { filterIds: { value: batch } },
      }),
    });
    const payload = unwrap(result.payload);
    resolved += array(payload?.players).filter((poolEntryValue) => {
      const poolEntry = object(poolEntryValue);
      const player = object(poolEntry?.player) ?? poolEntry;
      return number(player?.id) !== null && string(player?.fullName) !== null;
    }).length;
  }
  return resolved;
}

async function auditTransactions(
  leagueId: string,
  season: number,
  headers: HeadersInit,
) {
  const url = new URL(
    `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${leagueId}/communication/`,
  );
  url.searchParams.set("view", "kona_league_communication");
  const result = await fetchJson(
    url,
    {
      ...headers,
      "x-fantasy-filter": JSON.stringify({
        topics: {
          filterType: { value: ["ACTIVITY_TRANSACTIONS"] },
          limit: 500,
          offset: 0,
          sortMessageDate: { sortPriority: 1, sortAsc: false },
        },
      }),
    },
    [200, 404],
  );
  const payload = object(result.payload);
  const topics = array(payload?.topics);
  const messages = topics.flatMap((topicValue) =>
    array(object(topicValue)?.messages),
  );
  const messageTypes = new Set<number>();
  let timestampMessages = 0;
  for (const messageValue of messages) {
    const message = object(messageValue);
    const messageType = number(message?.messageTypeId);
    if (messageType !== null) messageTypes.add(messageType);
    if (number(message?.date) !== null) timestampMessages += 1;
  }
  return {
    status: result.status,
    topics: topics.length,
    messages: messages.length,
    timestampMessages,
    messageTypes: [...messageTypes].sort((a, b) => a - b),
  };
}

async function auditSeason(
  leagueId: string,
  season: number,
  headers: HeadersInit,
): Promise<SeasonAudit> {
  const summaryUrl = leagueUrl(leagueId, season);
  for (const view of ["mSettings", "mDraftDetail", "mTeam"]) {
    summaryUrl.searchParams.append("view", view);
  }
  const summaryResult = await fetchJson(summaryUrl, headers);
  const summary = unwrap(summaryResult.payload);
  const status = object(summary?.status);
  const firstWeek = number(status?.firstScoringPeriod) ?? 1;
  const latestWeek = number(status?.latestScoringPeriod) ?? firstWeek;
  const weeks = Array.from(
    { length: Math.max(0, latestWeek - firstWeek + 1) },
    (_, index) => firstWeek + index,
  );
  const picks = draftPicks(summary);
  const draftedIds = picks
    .map((pick) => number(pick.playerId))
    .filter((id): id is number => id !== null);
  const resolvedDraftPlayers = await resolveDraftPlayers(
    leagueId,
    season,
    draftedIds,
    headers,
  );

  const rosterSignatures = new Set<string>();
  const acquisitionTypes = new Set<string>();
  let weeklyRosterWeeks = 0;
  let playerIdentityWeeks = 0;
  let lineupSlotWeeks = 0;
  let weeklyBoxscoreWeeks = 0;
  let actualScoreWeeks = 0;
  let projectionWeeks = 0;
  let injuryStatusWeeks = 0;
  let acquisitionMetadataWeeks = 0;

  for (const week of weeks) {
    const weekUrl = leagueUrl(leagueId, season);
    weekUrl.searchParams.set("scoringPeriodId", String(week));
    weekUrl.searchParams.append("view", "mRoster");
    weekUrl.searchParams.append("view", "mBoxscore");
    const weekResult = await fetchJson(weekUrl, headers);
    const payload = unwrap(weekResult.payload);
    const roster = rosterEntries(payload);
    const boxscore = boxscoreEntries(payload);
    if (roster.length > 0) weeklyRosterWeeks += 1;
    if (boxscore.length > 0) weeklyBoxscoreWeeks += 1;
    if (
      roster.some(({ entry }) => {
        const player = playerFromEntry(entry);
        return number(player?.id) !== null && string(player?.fullName) !== null;
      })
    ) {
      playerIdentityWeeks += 1;
    }
    if (roster.some(({ entry }) => number(entry?.lineupSlotId) !== null)) {
      lineupSlotWeeks += 1;
    }
    if (
      boxscore.some(
        ({ entry }) =>
          number(object(entry?.playerPoolEntry)?.appliedStatTotal) !== null,
      )
    ) {
      actualScoreWeeks += 1;
    }

    const snapshot = roster
      .map(({ teamId, entry }) => [
        teamId,
        playerId(entry),
        number(entry?.lineupSlotId),
      ])
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
    rosterSignatures.add(signature(snapshot));

    let weekHasProjection = false;
    let weekHasInjuryStatus = false;
    let weekHasAcquisitionMetadata = false;
    for (const { entry } of roster) {
      const player = playerFromEntry(entry);
      if (hasWeekProjection(player, week)) weekHasProjection = true;
      if (string(player?.injuryStatus) !== null) weekHasInjuryStatus = true;
      const acquisitionType = string(entry?.acquisitionType);
      if (acquisitionType) acquisitionTypes.add(acquisitionType);
      if (acquisitionType && number(entry?.acquisitionDate) !== null) {
        weekHasAcquisitionMetadata = true;
      }
    }
    if (weekHasProjection) projectionWeeks += 1;
    if (weekHasInjuryStatus) injuryStatusWeeks += 1;
    if (weekHasAcquisitionMetadata) acquisitionMetadataWeeks += 1;
  }

  const transactions = await auditTransactions(leagueId, season, headers);
  return {
    season,
    endpoint: season < 2018 ? "legacy" : "season",
    weeksRequested: weeks.length,
    distinctRosterSnapshots: rosterSignatures.size,
    weeklyRosterWeeks,
    playerIdentityWeeks,
    lineupSlotWeeks,
    weeklyBoxscoreWeeks,
    actualScoreWeeks,
    projectionWeeks,
    injuryStatusWeeks,
    acquisitionMetadataWeeks,
    multiWeekMatchupPeriods: matchupPeriodStats(summary),
    draftPicks: picks.length,
    resolvedDraftPlayers,
    acquisitionTypes: [...acquisitionTypes].sort(),
    transactionFeedStatus: transactions.status,
    transactionTopics: transactions.topics,
    transactionMessages: transactions.messages,
    transactionTimestampMessages: transactions.timestampMessages,
    transactionMessageTypes: transactions.messageTypes,
  };
}

function printTable(audits: SeasonAudit[]) {
  console.log(
    "season endpoint weeks snapshots lineup actual projected injury acquisition draft resolved tx-http tx-topics",
  );
  for (const audit of audits) {
    console.log(
      [
        audit.season,
        audit.endpoint,
        audit.weeksRequested,
        audit.distinctRosterSnapshots,
        audit.lineupSlotWeeks,
        audit.actualScoreWeeks,
        audit.projectionWeeks,
        audit.injuryStatusWeeks,
        audit.acquisitionMetadataWeeks,
        audit.draftPicks,
        audit.resolvedDraftPlayers,
        audit.transactionFeedStatus,
        audit.transactionTopics,
      ].join(" "),
    );
  }
  console.log("\nNotes:");
  console.log("- Output contains counts and field coverage only. No raw payloads are saved.");
  console.log(
    "- A single repeated legacy snapshot does not prove weekly roster or lineup history.",
  );
  console.log(
    "- Injury fields show availability, not independently verified historical accuracy.",
  );
  console.log(
    "- HTTP 404 or zero topics means the historical transaction feed is unavailable.",
  );
}

async function main() {
  const leagueId = requiredEnv("ESPN_LEAGUE_ID");
  if (!/^\d+$/.test(leagueId)) throw new Error("ESPN_LEAGUE_ID must be numeric.");
  const s2 = requiredEnv("ESPN_S2");
  const swid = requiredEnv("ESPN_SWID");
  const headers: HeadersInit = {
    Accept: "application/json",
    Cookie: `espn_s2=${s2}; SWID=${swid}`,
  };
  const audits: SeasonAudit[] = [];
  for (const season of seasonRange()) {
    audits.push(await auditSeason(leagueId, season, headers));
  }
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(audits, null, 2));
  } else {
    printTable(audits);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "ESPN audit failed.");
  process.exitCode = 1;
});
