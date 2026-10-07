import "server-only";
import { normalizeLeague } from "./normalize";
import type { FantasyLeague } from "@/types/fantasy";

export const ESPN_SEASON = 2026;
const views = [
  "mTeam",
  "mRoster",
  "mStandings",
  "mMatchup",
  "mMatchupScore",
  "mSettings",
];

export class EspnError extends Error {}

export async function fetchEspnLeague(): Promise<FantasyLeague> {
  const leagueId = process.env.ESPN_LEAGUE_ID?.trim();
  const s2 = process.env.ESPN_S2?.trim();
  const swid = process.env.ESPN_SWID?.trim();
  if (!leagueId || !/^\d+$/.test(leagueId))
    throw new EspnError(
      "Set ESPN_LEAGUE_ID to your numeric league ID in .env.local.",
    );
  if (Boolean(s2) !== Boolean(swid))
    throw new EspnError(
      "Private leagues need both ESPN_S2 and ESPN_SWID in .env.local.",
    );
  if ([s2, swid].some((value) => value && /[;\r\n]/.test(value)))
    throw new EspnError(
      "ESPN cookies have an invalid format. Copy only their values into .env.local.",
    );
  const url = new URL(
    `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${ESPN_SEASON}/segments/0/leagues/${leagueId}`,
  );
  views.forEach((view) => url.searchParams.append("view", view));
  const headers: HeadersInit = { Accept: "application/json" };
  if (s2 && swid) headers.Cookie = `espn_s2=${s2}; SWID=${swid}`;
  let response: Response;
  try {
    response = await fetch(url, {
      headers,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new EspnError("ESPN could not be reached. Please try again shortly.");
  }
  if (response.status === 401 || response.status === 403)
    throw new EspnError(
      "ESPN denied access. Check your private-league cookies in .env.local.",
    );
  if (response.status === 404)
    throw new EspnError(
      "League not found for 2026. Check your league ID and season availability.",
    );
  if (!response.ok)
    throw new EspnError(
      "ESPN is temporarily unavailable. Please try again shortly.",
    );
  try {
    const league = normalizeLeague(await response.json());
    if (league.season !== ESPN_SEASON || Number(league.id) !== Number(leagueId))
      throw new Error("League mismatch");
    return league;
  } catch {
    throw new EspnError(
      "ESPN returned an unexpected league response. Check league access and try again.",
    );
  }
}
