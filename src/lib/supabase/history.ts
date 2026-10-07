import "server-only";
import { createClient } from "@supabase/supabase-js";

export type LeagueSeasonRow = {
  league_id: string;
  season: number;
  league_name: string;
  team_count: number;
  regular_season_weeks: number | null;
  playoff_team_count: number | null;
  is_complete: boolean;
  imported_at: string;
};

export type LeagueTeamRow = {
  league_id: string;
  season: number;
  team_id: string;
  team_name: string;
  abbreviation: string | null;
  manager_name: string | null;
  final_rank: number | null;
  playoff_seed: number | null;
  wins: number;
  losses: number;
  ties: number;
  points_for: number;
  points_against: number;
};

export type LeagueGameRow = {
  league_id: string;
  season: number;
  game_id: string;
  week: number;
  matchup_period: number;
  is_playoff: boolean;
  playoff_tier_type: string | null;
  home_team_id: string;
  home_team_name: string;
  home_manager_name: string | null;
  home_score: number;
  away_team_id: string;
  away_team_name: string;
  away_manager_name: string | null;
  away_score: number;
};

export type StoredLeagueHistory = {
  seasons: LeagueSeasonRow[];
  teams: LeagueTeamRow[];
  games: LeagueGameRow[];
};

export async function getStoredLeagueHistory(
  leagueId: string,
): Promise<StoredLeagueHistory | null> {
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
      .select("*")
      .eq("league_id", leagueId)
      .order("season", { ascending: false }),
    supabase
      .from("league_teams")
      .select("*")
      .eq("league_id", leagueId)
      .order("season", { ascending: false }),
    supabase
      .from("league_games")
      .select("*")
      .eq("league_id", leagueId)
      .order("season", { ascending: false })
      .order("week", { ascending: false }),
  ]);

  const error = seasonResult.error ?? teamResult.error ?? gameResult.error;
  if (error) throw new Error("Supabase history is unavailable.");
  if (!seasonResult.data?.length) return null;

  return {
    seasons: seasonResult.data as LeagueSeasonRow[],
    teams: (teamResult.data ?? []) as LeagueTeamRow[],
    games: (gameResult.data ?? []) as LeagueGameRow[],
  };
}
