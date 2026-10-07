import "server-only";
import { fetchEspnLeague } from "@/lib/espn/client";
import { mockLeague } from "@/lib/fixtures/mock-league";
import type { LeagueData } from "@/types/fantasy";

export async function getLeagueData(): Promise<LeagueData> {
  if (!process.env.ESPN_LEAGUE_ID?.trim())
    return { source: "mock", league: mockLeague };
  return { source: "espn", league: await fetchEspnLeague() };
}
