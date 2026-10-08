import "server-only";
import { EspnError } from "../client";
import { buildCurrentPlayerImport, normalizePlayerPeriod, normalizeTransactions } from "./normalize";
import type { CurrentPlayerImport, PlayerPeriod } from "./types";

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
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function config() {
  const leagueId = process.env.ESPN_LEAGUE_ID?.trim();
  const s2 = process.env.ESPN_S2?.trim();
  const swid = process.env.ESPN_SWID?.trim();
  if (!leagueId || !/^\d+$/.test(leagueId)) {
    throw new EspnError("Set ESPN_LEAGUE_ID to a numeric league ID.");
  }
  if (Boolean(s2) !== Boolean(swid) || [s2, swid].some((value) => value && /[;\r\n]/.test(value))) {
    throw new EspnError("ESPN private-league cookies are invalid.");
  }
  return { leagueId, s2, swid };
}

function leagueUrl(leagueId: string, season: number) {
  return new URL(
    `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${leagueId}`,
  );
}

function transactionUrl(leagueId: string, season: number) {
  return new URL(
    `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${leagueId}/communication/`,
  );
}

function headers(s2: string | undefined, swid: string | undefined): HeadersInit {
  return s2 && swid
    ? { Accept: "application/json", Cookie: `espn_s2=${s2}; SWID=${swid}` }
    : { Accept: "application/json" };
}

async function getJson(url: URL, requestHeaders: HeadersInit, fetcher: typeof fetch) {
  let response: Response;
  try {
    response = await fetcher(url, {
      headers: requestHeaders,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new EspnError("ESPN could not be reached for player data.");
  }
  if (response.status === 401 || response.status === 403) {
    throw new EspnError("ESPN denied access to player data.");
  }
  if (!response.ok) throw new EspnError("ESPN player data is unavailable.");
  try {
    return await response.json();
  } catch {
    throw new EspnError("ESPN returned invalid player data.");
  }
}

function summaryDetails(payload: unknown, expectedSeason: number) {
  const summary = object(payload);
  const season = number(summary?.seasonId);
  const status = object(summary?.status);
  const first = number(status?.firstScoringPeriod) ?? 1;
  const latest = number(status?.latestScoringPeriod) ?? number(summary?.scoringPeriodId);
  const teamIds = array(summary?.teams)
    .map(object)
    .map((team) => number(team?.id))
    .filter((id): id is number => id !== null)
    .map(String);
  const counts = object(object(object(summary?.settings)?.rosterSettings)?.lineupSlotCounts);
  const lineupSlotCounts = counts
    ? Object.fromEntries(
        Object.entries(counts).flatMap(([slot, count]) => {
          const slotId = Number(slot);
          return Number.isInteger(slotId) && number(count) !== null && number(count)! >= 0
            ? [[String(slotId), number(count)!]]
            : [];
        }),
      )
    : null;
  if (
    season !== expectedSeason ||
    latest === null ||
    latest < first ||
    !teamIds.length ||
    new Set(teamIds).size !== teamIds.length
  ) {
    throw new EspnError("ESPN returned incomplete player season data.");
  }
  return { first, latest, teamIds, lineupSlotCounts };
}

async function playerSeasonDetails(input: {
  leagueId: string;
  season: number;
  requestHeaders: HeadersInit;
  fetcher: typeof fetch;
}) {
  const summaryUrl = leagueUrl(input.leagueId, input.season);
  for (const view of ["mTeam", "mSettings"]) summaryUrl.searchParams.append("view", view);
  return summaryDetails(
    await getJson(summaryUrl, input.requestHeaders, input.fetcher),
    input.season,
  );
}

async function playerPeriodPayload(input: {
  leagueId: string;
  season: number;
  scoringPeriodId: number;
  requestHeaders: HeadersInit;
  fetcher: typeof fetch;
}) {
  const periodUrl = leagueUrl(input.leagueId, input.season);
  periodUrl.searchParams.set("scoringPeriodId", String(input.scoringPeriodId));
  periodUrl.searchParams.append("view", "mRoster");
  periodUrl.searchParams.append("view", "mBoxscore");
  return getJson(periodUrl, input.requestHeaders, input.fetcher);
}

function transactionEvidenceStatus(payload: unknown) {
  const activity = object(payload);
  if (!activity || !Array.isArray(activity.topics)) {
    throw new EspnError("ESPN returned incomplete transaction activity data.");
  }
  return "unverified" as const;
}

export async function fetchCurrentPlayerImport(options: {
  season: number;
  fetcher?: typeof fetch;
  observedAt?: () => Date;
}): Promise<CurrentPlayerImport> {
  if (!Number.isInteger(options.season) || options.season < 2018) {
    throw new EspnError("Weekly player data is unavailable before 2018.");
  }
  const { leagueId, s2, swid } = config();
  const fetcher = options.fetcher ?? fetch;
  const requestHeaders = headers(s2, swid);
  const observedAt = (options.observedAt ?? (() => new Date()))().toISOString();

  const activityUrl = transactionUrl(leagueId, options.season);
  activityUrl.searchParams.set("view", "kona_league_communication");
  const activityHeaders = new Headers(requestHeaders);
  activityHeaders.set(
    "x-fantasy-filter",
    JSON.stringify({
      topics: {
        filterType: { value: ["ACTIVITY_TRANSACTIONS"] },
        limit: 500,
        offset: 0,
        sortMessageDate: { sortPriority: 1, sortAsc: false },
      },
    }),
  );
  const activityPayload = await getJson(activityUrl, activityHeaders, fetcher);
  const activityEvidenceStatus = transactionEvidenceStatus(activityPayload);
  const transactions = normalizeTransactions({
    leagueId,
    season: options.season,
    payload: activityPayload,
    observedAt,
  });

  const details = await playerSeasonDetails({ leagueId, season: options.season, requestHeaders, fetcher });
  const periods = [];
  for (let scoringPeriodId = details.first; scoringPeriodId <= details.latest; scoringPeriodId += 1) {
    const payload = await playerPeriodPayload({
      leagueId,
      season: options.season,
      scoringPeriodId,
      requestHeaders,
      fetcher,
    });
    periods.push(
      normalizePlayerPeriod({
        leagueId,
        season: options.season,
        scoringPeriodId,
        expectedTeamIds: details.teamIds,
        payload,
        observedAt,
        transactionEvidenceStatus: activityEvidenceStatus,
        lineupSlotCounts:
          scoringPeriodId === details.latest ? details.lineupSlotCounts : null,
      }),
    );
  }
  return buildCurrentPlayerImport({ leagueId, season: options.season, periods, transactions });
}

export type HistoricalPlayerImport = {
  leagueId: string;
  season: number;
  periods: PlayerPeriod[];
  transactions: [];
};

export type HistoricalPlayerImportUnavailable = {
  leagueId: null;
  season: 2017;
  reason: "ESPN does not retain weekly roster or box-score evidence for 2017.";
};

export async function fetchHistoricalPlayerImport(options: {
  season: number;
  firstScoringPeriod?: number;
  lastScoringPeriod?: number;
  fetcher?: typeof fetch;
  observedAt?: () => Date;
}): Promise<HistoricalPlayerImport | HistoricalPlayerImportUnavailable> {
  if (options.season === 2017) {
    return {
      leagueId: null,
      season: 2017,
      reason: "ESPN does not retain weekly roster or box-score evidence for 2017.",
    };
  }
  if (!Number.isInteger(options.season) || options.season < 2018 || options.season > 2025) {
    throw new EspnError("Historical player imports support seasons 2017 through 2025.");
  }
  const { leagueId, s2, swid } = config();
  const fetcher = options.fetcher ?? fetch;
  const requestHeaders = headers(s2, swid);
  const observedAt = (options.observedAt ?? (() => new Date()))().toISOString();
  const details = await playerSeasonDetails({ leagueId, season: options.season, requestHeaders, fetcher });
  const first = options.firstScoringPeriod ?? details.first;
  const last = options.lastScoringPeriod ?? details.latest;
  if (!Number.isInteger(first) || !Number.isInteger(last) || first < details.first || last > details.latest || first > last) {
    throw new EspnError("Requested scoring periods are outside ESPN's reported historical range.");
  }
  const periods: PlayerPeriod[] = [];
  for (let scoringPeriodId = first; scoringPeriodId <= last; scoringPeriodId += 1) {
    const payload = await playerPeriodPayload({
      leagueId,
      season: options.season,
      scoringPeriodId,
      requestHeaders,
      fetcher,
    });
    periods.push(normalizePlayerPeriod({
      leagueId,
      season: options.season,
      scoringPeriodId,
      expectedTeamIds: details.teamIds,
      payload,
      observedAt,
      transactionEvidenceStatus: "unavailable",
      lineupSlotCounts: null,
      suppressHistoricalFields: true,
    }));
  }
  return { leagueId, season: options.season, periods, transactions: [] };
}
