import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { AnalyticsArchive } from "./types";

type SeasonRow = {
  season: number;
  league_name: string;
  regular_season_weeks: number | null;
  is_complete: boolean;
};

type TeamRow = {
  season: number;
  team_id: string;
  team_name: string;
  manager_name: string | null;
};

type GameRow = {
  season: number;
  game_id: string;
  week: number;
  is_playoff: boolean;
  home_team_id: string;
  home_score: number | string;
  away_team_id: string;
  away_score: number | string;
};

export async function getAnalyticsArchive(
  leagueId: string,
): Promise<AnalyticsArchive | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) return null;

  const supabase = createClient(url, publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const [seasonResult, teamResult, gameResult] = await Promise.all([
    supabase
      .from("league_seasons")
      .select("season, league_name, regular_season_weeks, is_complete")
      .eq("league_id", leagueId)
      .order("season", { ascending: false }),
    supabase
      .from("league_teams")
      .select("season, team_id, team_name, manager_name")
      .eq("league_id", leagueId)
      .order("season", { ascending: false }),
    supabase
      .from("league_games")
      .select(
        "season, game_id, week, is_playoff, home_team_id, home_score, away_team_id, away_score",
      )
      .eq("league_id", leagueId)
      .order("season", { ascending: false })
      .order("week", { ascending: true }),
  ]);

  const error = seasonResult.error ?? teamResult.error ?? gameResult.error;
  if (error) throw new Error("League analytics are unavailable.");
  if (!seasonResult.data?.length) return null;

  return {
    seasons: (seasonResult.data as SeasonRow[]).map((row) => ({
      season: row.season,
      leagueName: row.league_name,
      regularSeasonWeeks: row.regular_season_weeks,
      isComplete: row.is_complete,
    })),
    teams: ((teamResult.data ?? []) as TeamRow[]).map((row) => ({
      season: row.season,
      teamId: row.team_id,
      teamName: row.team_name,
      managerName: row.manager_name,
    })),
    games: ((gameResult.data ?? []) as GameRow[]).map((row) => ({
      season: row.season,
      gameId: row.game_id,
      week: row.week,
      isPlayoff: row.is_playoff,
      homeTeamId: row.home_team_id,
      homeScore: Number(row.home_score),
      awayTeamId: row.away_team_id,
      awayScore: Number(row.away_score),
    })),
  };
}
