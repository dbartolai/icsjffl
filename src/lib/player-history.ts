import "server-only";

import { createClient } from "@supabase/supabase-js";

const PAGE_SIZE = 25;
const MAX_PAGE = 100;
const MIN_SEASON = 2017;
const MAX_SEASON = 2026;

export type PlayerSummary = {
  espn_player_id: number;
  display_name: string;
  default_position_id: number | null;
  first_seen_season: number;
  last_seen_season: number;
};

export type DraftPick = {
  season: number;
  round: number;
  round_pick: number;
  overall_pick: number;
  team_id: string;
};

export type PlayerWeek = {
  season: number;
  scoring_period_id: number;
  team_id: string;
  lineup_slot_id: number | null;
  actual_points: number | null;
  projected_points: number | null;
  lineup_evidence_status: string;
  actual_score_evidence_status: string;
  projection_evidence_status: string;
};

export type Coverage = {
  season: number;
  scoring_period_id: number;
  roster_evidence_status: string;
  lineup_evidence_status: string;
  actual_score_evidence_status: string;
  projection_evidence_status: string;
  reason: string;
};

export type PlayerHistory = {
  player: PlayerSummary;
  drafts: DraftPick[];
  weeks: PlayerWeek[];
  coverage: Coverage[];
  teamNames: Map<string, string>;
};

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) return null;
  return createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function leagueId() {
  return process.env.ESPN_LEAGUE_ID?.trim() || null;
}

export function parsePlayerId(value: string) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id !== 0 ? id : null;
}

export function parseSeason(value: string | undefined) {
  const season = Number(value);
  return Number.isInteger(season) && season >= MIN_SEASON && season <= MAX_SEASON
    ? season
    : null;
}

export function parseWeek(value: string | undefined) {
  const week = Number(value);
  return Number.isInteger(week) && week > 0 && week <= 30 ? week : null;
}

export async function listPlayers(input: { query?: string; page?: string }) {
  const supabase = client();
  if (!supabase) return null;
  const query = input.query?.trim().slice(0, 80) ?? "";
  const requestedPage = Number(input.page);
  const page = Number.isInteger(requestedPage) && requestedPage > 0
    ? Math.min(requestedPage, MAX_PAGE)
    : 1;
  let request = supabase
    .from("players")
    .select("espn_player_id, display_name, default_position_id, first_seen_season, last_seen_season", {
      count: "exact",
    })
    .order("display_name", { ascending: true })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (query) request = request.ilike("display_name", `%${query}%`);
  const { data, error, count } = await request;
  if (error) throw new Error("Player history is unavailable.");
  return {
    players: (data ?? []) as PlayerSummary[],
    query,
    page,
    total: count ?? 0,
    pageSize: PAGE_SIZE,
  };
}

export async function getPlayerHistory(input: {
  playerId: number;
  season: number | null;
  week: number | null;
}): Promise<PlayerHistory | null> {
  const supabase = client();
  const currentLeagueId = leagueId();
  if (!supabase || !currentLeagueId) return null;

  const playerResult = await supabase
    .from("players")
    .select("espn_player_id, display_name, default_position_id, first_seen_season, last_seen_season")
    .eq("espn_player_id", input.playerId)
    .maybeSingle();
  if (playerResult.error) throw new Error("Player history is unavailable.");
  if (!playerResult.data) return null;

  let weeksRequest = supabase
    .from("player_week_entries")
    .select("season, scoring_period_id, team_id, lineup_slot_id, actual_points, projected_points, lineup_evidence_status, actual_score_evidence_status, projection_evidence_status")
    .eq("league_id", currentLeagueId)
    .eq("espn_player_id", input.playerId)
    .order("season", { ascending: false })
    .order("scoring_period_id", { ascending: false })
    .limit(250);
  if (input.season) weeksRequest = weeksRequest.eq("season", input.season);
  if (input.week) weeksRequest = weeksRequest.eq("scoring_period_id", input.week);

  let coverageRequest = supabase
    .from("player_data_coverage")
    .select("season, scoring_period_id, roster_evidence_status, lineup_evidence_status, actual_score_evidence_status, projection_evidence_status, reason")
    .eq("league_id", currentLeagueId)
    .order("season", { ascending: false })
    .order("scoring_period_id", { ascending: false })
    .limit(250);
  if (input.season) coverageRequest = coverageRequest.eq("season", input.season);
  if (input.week) coverageRequest = coverageRequest.eq("scoring_period_id", input.week);

  const [draftResult, weeksResult, coverageResult] = await Promise.all([
    supabase
      .from("league_draft_picks")
      .select("season, round, round_pick, overall_pick, team_id")
      .eq("league_id", currentLeagueId)
      .eq("espn_player_id", input.playerId)
      .order("season", { ascending: false })
      .limit(25),
    weeksRequest,
    coverageRequest,
  ]);
  const error = draftResult.error ?? weeksResult.error ?? coverageResult.error;
  if (error) throw new Error("Player history is unavailable.");

  const drafts = (draftResult.data ?? []) as DraftPick[];
  const weeks = (weeksResult.data ?? []) as PlayerWeek[];
  const teamIds = [...new Set([...drafts, ...weeks].map((row) => row.team_id))];
  const teamNames = new Map<string, string>();
  if (teamIds.length) {
    const { data, error: teamError } = await supabase
      .from("league_teams")
      .select("season, team_id, team_name")
      .eq("league_id", currentLeagueId)
      .in("team_id", teamIds)
      .limit(100);
    if (teamError) throw new Error("Player history is unavailable.");
    for (const team of data ?? []) teamNames.set(`${team.season}:${team.team_id}`, team.team_name);
  }

  return {
    player: playerResult.data as PlayerSummary,
    drafts,
    weeks,
    coverage: (coverageResult.data ?? []) as Coverage[],
    teamNames,
  };
}
