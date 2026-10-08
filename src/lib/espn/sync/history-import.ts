import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchEspnHistory } from "../history";
import type { HistoricalSeason, HistoricalTeam } from "../history-types";

export type SyncRowCounts = {
  seasons: number;
  teams: number;
  games: number;
  snapshots: number;
};

export type SeasonImportResult = {
  leagueId: string;
  season: number;
  rows: SyncRowCounts;
};

function managerName(season: HistoricalSeason, team: HistoricalTeam) {
  const names = team.managerIds.flatMap((managerId) => {
    const manager = season.managers.find(
      (candidate) => candidate.id === managerId,
    );
    return manager ? [manager.displayName] : [];
  });
  return names.length ? names.join(" & ") : null;
}

export function rowsForSeason(season: HistoricalSeason) {
  const teamById = new Map(season.teams.map((team) => [team.id, team]));
  const teams = season.teams.map((team) => ({
    league_id: season.leagueId,
    season: season.season,
    team_id: team.id,
    team_name: team.name,
    abbreviation: team.abbreviation,
    manager_name: managerName(season, team),
    final_rank: team.finalRank,
    playoff_seed: null,
    wins: team.wins,
    losses: team.losses,
    ties: team.ties,
    points_for: team.pointsFor,
    points_against: team.pointsAgainst,
  }));
  const games = season.matchups.map((game) => {
    const home = teamById.get(game.homeTeamId);
    const away = teamById.get(game.awayTeamId);
    if (!home || !away) throw new Error("A historical game has an unknown team.");
    return {
      league_id: season.leagueId,
      season: season.season,
      game_id: game.id,
      week: game.week,
      matchup_period: game.matchupPeriod,
      is_playoff: game.isPlayoff ?? false,
      playoff_tier_type: null,
      home_team_id: home.id,
      home_team_name: home.name,
      home_manager_name: managerName(season, home),
      home_score: game.homeScore,
      away_team_id: away.id,
      away_team_name: away.name,
      away_manager_name: managerName(season, away),
      away_score: game.awayScore,
    };
  });
  const regularSeasonWeeks = Math.max(
    0,
    ...season.matchups
      .filter((game) => game.isPlayoff === false)
      .map((game) => game.week),
  );
  return { teams, games, regularSeasonWeeks };
}

export async function upsertSeason(
  supabase: SupabaseClient,
  season: HistoricalSeason,
): Promise<SeasonImportResult> {
  const { teams, games, regularSeasonWeeks } = rowsForSeason(season);
  const importedAt = new Date().toISOString();
  const seasonResult = await supabase.from("league_seasons").upsert(
    {
      league_id: season.leagueId,
      season: season.season,
      league_name: season.leagueName,
      team_count: teams.length,
      regular_season_weeks: regularSeasonWeeks || null,
      playoff_team_count: null,
      is_complete: Boolean(season.championTeamId),
      imported_at: importedAt,
    },
    { onConflict: "league_id,season" },
  );
  if (seasonResult.error) throw seasonResult.error;

  const teamResult = await supabase
    .from("league_teams")
    .upsert(teams, { onConflict: "league_id,season,team_id" });
  if (teamResult.error) throw teamResult.error;

  for (let start = 0; start < games.length; start += 250) {
    const gameResult = await supabase
      .from("league_games")
      .upsert(games.slice(start, start + 250), {
        onConflict: "league_id,season,game_id,week",
      });
    if (gameResult.error) throw gameResult.error;
  }

  const snapshotResult = await supabase.from("espn_season_snapshots").upsert(
    {
      league_id: season.leagueId,
      season: season.season,
      fetched_at: importedAt,
      source_payload: season,
    },
    { onConflict: "league_id,season" },
  );
  if (snapshotResult.error) throw snapshotResult.error;

  return {
    leagueId: season.leagueId,
    season: season.season,
    rows: {
      seasons: 1,
      teams: teams.length,
      games: games.length,
      snapshots: 1,
    },
  };
}

export async function importEspnSeasons(options: {
  seasons: readonly number[];
  supabase?: SupabaseClient | null;
  fetcher?: typeof fetch;
}): Promise<SeasonImportResult[]> {
  const history = await fetchEspnHistory({
    seasons: options.seasons,
    fetcher: options.fetcher,
  });
  const results: SeasonImportResult[] = [];
  for (const season of history) {
    if (options.supabase) {
      results.push(await upsertSeason(options.supabase, season));
    } else {
      const { teams, games } = rowsForSeason(season);
      results.push({
        leagueId: season.leagueId,
        season: season.season,
        rows: {
          seasons: 1,
          teams: teams.length,
          games: games.length,
          snapshots: 1,
        },
      });
    }
  }
  return results;
}
