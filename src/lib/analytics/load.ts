import "server-only";

import { getAnalyticsArchive } from "./adapter";
import { calculateLeagueAnalytics } from "./calculate";
import type { LeagueAnalytics } from "./types";

export async function getLeagueAnalytics(
  selectedSeason: number | null,
): Promise<LeagueAnalytics | null> {
  const leagueId = process.env.ESPN_LEAGUE_ID?.trim();
  if (!leagueId) return null;
  const archive = await getAnalyticsArchive(leagueId);
  return archive ? calculateLeagueAnalytics(archive, selectedSeason) : null;
}
