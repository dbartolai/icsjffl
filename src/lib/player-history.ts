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
  availableSeasons: number[];
  availableWeeks: number[];
  teamNames: Map<string, string>;
};

export type RosterTeam = {
  teamId: string;
  teamName: string;
  season: number;
  week: number;
};

export type TeamRoster = {
  team: RosterTeam | null;
  players: Array<PlayerWeek & PlayerSummary>;
  availableSeasons: number[];
  availableWeeks: number[];
  requestedPeriodMissing: boolean;
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

export function clampPlayerPage(page: number, total: number, pageSize = PAGE_SIZE) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return Math.min(Math.max(page, 1), totalPages);
}

export function filterDrafts(drafts: DraftPick[], season: number | null) {
  return season ? drafts.filter((draft) => draft.season === season) : drafts;
}

export function formatPosition(positionId: number | null) {
  const positions: Record<number, string> = {
    1: "Quarterback",
    2: "Running back",
    3: "Wide receiver",
    4: "Tight end",
    5: "Kicker",
    16: "D/ST",
  };
  return positionId === null ? "—" : positions[positionId] ?? `Position ID ${positionId}`;
}

export function playerPresence(player: PlayerSummary, latestSeason: number | null) {
  const observed = `Played in ${player.first_seen_season}${player.first_seen_season === player.last_seen_season ? "" : `–${player.last_seen_season}`}`;
  return latestSeason !== null && player.last_seen_season < latestSeason
    ? `Former league player · ${observed}`
    : observed;
}

export function teamChoicesForPeriod(
  teams: Array<{ team_id: string; team_name: string }>,
  period: { season: number; scoring_period_id: number },
) {
  return teams
    .map((team) => ({ teamId: team.team_id, teamName: team.team_name, season: period.season, week: period.scoring_period_id }))
    .sort((left, right) => left.teamName.localeCompare(right.teamName));
}

export function uniqueRosterWeeks(rows: Array<{ scoring_period_id: number }>) {
  return [...new Set(rows.map((entry) => entry.scoring_period_id))].sort((a, b) => a - b);
}

export function latestRosterWeek(weeks: number[]) {
  return weeks.at(-1) ?? null;
}

export async function searchPlayers(query: string, limit = 8) {
  const supabase = client();
  const normalizedQuery = query.trim().slice(0, 80);
  if (!supabase || normalizedQuery.length < 2) return [];
  const { data, error } = await supabase
    .from("players")
    .select("espn_player_id, display_name, default_position_id, first_seen_season, last_seen_season")
    .ilike("display_name", `%${normalizedQuery}%`)
    .order("display_name", { ascending: true })
    .order("espn_player_id", { ascending: true })
    .limit(Math.min(Math.max(limit, 1), 25));
  if (error) throw new Error("Player history is unavailable.");
  return (data ?? []) as PlayerSummary[];
}

export async function listPlayers(input: { query?: string; page?: string }) {
  const supabase = client();
  if (!supabase) return null;
  const query = input.query?.trim().slice(0, 80) ?? "";
  if (!query) return { players: [], query, page: 1, total: 0, pageSize: PAGE_SIZE };
  const rawPage = Number(input.page);
  const requestedPage = Number.isInteger(rawPage) && rawPage > 0
    ? Math.min(rawPage, MAX_PAGE)
    : 1;
  let countRequest = supabase
    .from("players")
    .select("*", { count: "exact", head: true });
  if (query) countRequest = countRequest.ilike("display_name", `%${query}%`);
  const { count, error: countError } = await countRequest;
  if (countError) throw new Error("Player history is unavailable.");

  const page = clampPlayerPage(requestedPage, count ?? 0);
  const request = () => {
    let queryRequest = supabase
      .from("players")
      .select("espn_player_id, display_name, default_position_id, first_seen_season, last_seen_season")
      .order("display_name", { ascending: true })
      .order("espn_player_id", { ascending: true })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
    if (query) queryRequest = queryRequest.ilike("display_name", `%${query}%`);
    return queryRequest;
  };
  const { data, error } = await request();
  if (error) throw new Error("Player history is unavailable.");
  return {
    players: (data ?? []) as PlayerSummary[],
    query,
    page,
    total: count ?? 0,
    pageSize: PAGE_SIZE,
  };
}

export async function getRosterTeamChoices() {
  const supabase = client();
  const currentLeagueId = leagueId();
  if (!supabase || !currentLeagueId) return null;

  const { data: coverage, error: coverageError } = await supabase
    .from("player_data_coverage")
    .select("season, scoring_period_id")
    .eq("league_id", currentLeagueId)
    .eq("roster_evidence_status", "confirmed")
    .order("season", { ascending: false })
    .order("scoring_period_id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (coverageError) throw new Error("Player history is unavailable.");
  if (!coverage) return [];

  const { data: teams, error: teamsError } = await supabase
    .from("league_teams")
    .select("team_id, team_name")
    .eq("league_id", currentLeagueId)
    .eq("season", coverage.season)
    .limit(100);
  if (teamsError) throw new Error("Player history is unavailable.");
  return teamChoicesForPeriod(teams ?? [], coverage);
}

export async function getTeamRoster(input: { teamId: string; season: number | null; week: number | null }): Promise<TeamRoster | null> {
  const supabase = client();
  const currentLeagueId = leagueId();
  if (!supabase || !currentLeagueId) return null;
  const teamId = input.teamId.trim().slice(0, 80);
  if (!teamId) return null;

  const { data: teamRows, error: teamError } = await supabase
    .from("league_teams")
    .select("season, team_id, team_name")
    .eq("league_id", currentLeagueId)
    .eq("team_id", teamId)
    .order("season", { ascending: false })
    .limit(100);
  if (teamError) throw new Error("Player history is unavailable.");
  const availableSeasons = [...new Set((teamRows ?? []).map((team) => team.season))];
  if (!availableSeasons.length) return { team: null, players: [], availableSeasons: [], availableWeeks: [], requestedPeriodMissing: Boolean(input.season || input.week) };

  let periodRequest = supabase
    .from("player_week_entries")
    .select("season, scoring_period_id")
    .eq("league_id", currentLeagueId)
    .eq("team_id", teamId);
  if (input.season) periodRequest = periodRequest.eq("season", input.season);
  if (input.week) periodRequest = periodRequest.eq("scoring_period_id", input.week);
  const { data: period, error: periodError } = await periodRequest
    .order("season", { ascending: false })
    .order("scoring_period_id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (periodError) throw new Error("Player history is unavailable.");

  const selectedSeason = input.season ?? period?.season ?? availableSeasons[0];
  const { data: weekRows, error: weekError } = await supabase
    .from("player_data_coverage")
    .select("scoring_period_id")
    .eq("league_id", currentLeagueId)
    .eq("season", selectedSeason)
    .eq("roster_evidence_status", "confirmed")
    .order("scoring_period_id", { ascending: false })
    .limit(40);
  if (weekError) throw new Error("Player history is unavailable.");
  const availableWeeks = uniqueRosterWeeks(weekRows ?? []);
  const selectedTeam = (teamRows ?? []).find((team) => team.season === selectedSeason) ?? teamRows?.[0];
  if (!period) return {
    team: { teamId, teamName: selectedTeam?.team_name ?? `Team ${teamId}`, season: selectedSeason, week: input.week ?? latestRosterWeek(availableWeeks) ?? 0 },
    players: [],
    availableSeasons,
    availableWeeks,
    requestedPeriodMissing: Boolean(input.season || input.week),
  };

  const [{ data: entries, error: entriesError }, teamRow] = await Promise.all([
    supabase
      .from("player_week_entries")
      .select("espn_player_id, season, scoring_period_id, team_id, lineup_slot_id, actual_points, projected_points, lineup_evidence_status, actual_score_evidence_status, projection_evidence_status")
      .eq("league_id", currentLeagueId)
      .eq("team_id", teamId)
      .eq("season", period.season)
      .eq("scoring_period_id", period.scoring_period_id)
      .order("espn_player_id", { ascending: true })
      .limit(100),
    Promise.resolve((teamRows ?? []).find((team) => team.season === period.season)),
  ]);
  if (entriesError) throw new Error("Player history is unavailable.");
  const ids = (entries ?? []).map((entry) => entry.espn_player_id);
  const { data: players, error: playersError } = ids.length
    ? await supabase
      .from("players")
      .select("espn_player_id, display_name, default_position_id, first_seen_season, last_seen_season")
      .in("espn_player_id", ids)
      .limit(100)
    : { data: [], error: null };
  if (playersError) throw new Error("Player history is unavailable.");
  const playersById = new Map((players ?? []).map((player) => [player.espn_player_id, player as PlayerSummary]));
  return {
    team: { teamId, teamName: teamRow?.team_name ?? `Team ${teamId}`, season: period.season, week: period.scoring_period_id },
    players: (entries ?? []).flatMap((entry) => {
      const player = playersById.get(entry.espn_player_id);
      return player ? [{ ...entry, ...player } as PlayerWeek & PlayerSummary] : [];
    }).sort((left, right) => left.display_name.localeCompare(right.display_name) || left.espn_player_id - right.espn_player_id),
    availableSeasons,
    availableWeeks,
    requestedPeriodMissing: false,
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

  const weeksRequest = supabase
    .from("player_week_entries")
    .select("season, scoring_period_id, team_id, lineup_slot_id, actual_points, projected_points, lineup_evidence_status, actual_score_evidence_status, projection_evidence_status")
    .eq("league_id", currentLeagueId)
    .eq("espn_player_id", input.playerId)
    .order("season", { ascending: false })
    .order("scoring_period_id", { ascending: false })
    .limit(250);
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

  const allDrafts = (draftResult.data ?? []) as DraftPick[];
  const allWeeks = (weeksResult.data ?? []) as PlayerWeek[];
  const drafts = filterDrafts(allDrafts, input.season);
  const weeks = allWeeks.filter((entry) =>
    (!input.season || entry.season === input.season)
    && (!input.week || entry.scoring_period_id === input.week),
  );
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
    availableSeasons: [...new Set([...allDrafts, ...allWeeks].map((row) => row.season))].sort((a, b) => b - a),
    availableWeeks: [...new Set(allWeeks
      .filter((entry) => !input.season || entry.season === input.season)
      .map((entry) => entry.scoring_period_id))].sort((a, b) => a - b),
    teamNames,
  };
}
