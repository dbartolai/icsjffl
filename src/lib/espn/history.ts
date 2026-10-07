import "server-only";
import { normalizeHistoricalSeason } from "./history-normalize";
import type { HistoricalSeason } from "./history-types";
import { EspnError } from "./client";

export const HISTORY_SEASONS = Array.from(
  { length: 10 },
  (_, index) => 2017 + index,
);

const historyViews = [
  "mTeam",
  "mStandings",
  "mMatchup",
  "mMatchupScore",
  "mSettings",
  "mDraftDetail",
];

type HistoryOptions = {
  seasons?: readonly number[];
  fetcher?: typeof fetch;
};

function config() {
  const leagueId = process.env.ESPN_LEAGUE_ID?.trim();
  const s2 = process.env.ESPN_S2?.trim();
  const swid = process.env.ESPN_SWID?.trim();
  if (!leagueId || !/^\d+$/.test(leagueId)) {
    throw new EspnError("Set ESPN_LEAGUE_ID to your numeric league ID.");
  }
  if (Boolean(s2) !== Boolean(swid)) {
    throw new EspnError("Private leagues need both ESPN_S2 and ESPN_SWID.");
  }
  if ([s2, swid].some((value) => value && /[;\r\n]/.test(value))) {
    throw new EspnError("ESPN cookies have an invalid format.");
  }
  return { leagueId, s2, swid };
}

export function historicalSeasonUrl(leagueId: string, season: number) {
  const url =
    season < 2018
      ? new URL(
          `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/leagueHistory/${leagueId}`,
        )
      : new URL(
          `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${leagueId}`,
        );
  if (season < 2018) url.searchParams.set("seasonId", String(season));
  historyViews.forEach((view) => url.searchParams.append("view", view));
  return url;
}

export async function fetchEspnHistory(
  options: HistoryOptions = {},
): Promise<HistoricalSeason[]> {
  const { leagueId, s2, swid } = config();
  const fetcher = options.fetcher ?? fetch;
  const seasons = options.seasons ?? HISTORY_SEASONS;
  const headers: HeadersInit = { Accept: "application/json" };
  if (s2 && swid) headers.Cookie = `espn_s2=${s2}; SWID=${swid}`;

  return Promise.all(
    seasons.map(async (season) => {
      let response: Response;
      try {
        response = await fetcher(historicalSeasonUrl(leagueId, season), {
          headers,
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(15_000),
        });
      } catch {
        throw new EspnError(`ESPN could not be reached for season ${season}.`);
      }
      if (response.status === 401 || response.status === 403) {
        throw new EspnError(
          `ESPN denied access to season ${season}. Check the private-league cookies.`,
        );
      }
      if (response.status === 404) {
        throw new EspnError(`ESPN has no league data for season ${season}.`);
      }
      if (!response.ok) {
        throw new EspnError(`ESPN is unavailable for season ${season}.`);
      }
      try {
        const normalized = normalizeHistoricalSeason(
          await response.json(),
          season,
        );
        if (Number(normalized.leagueId) !== Number(leagueId)) {
          throw new Error("League mismatch");
        }
        return normalized;
      } catch {
        throw new EspnError(
          `ESPN returned an unexpected response for season ${season}.`,
        );
      }
    }),
  );
}

