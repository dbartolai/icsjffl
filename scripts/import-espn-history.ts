import { createClient } from "@supabase/supabase-js";
import { fetchEspnHistory, HISTORY_SEASONS } from "../src/lib/espn/history";
import type {
  HistoricalSeason,
  HistoricalTeam,
} from "../src/lib/espn/history-types";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

function seasonFromEnv(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 2000 || value > 2100) {
    throw new Error(`${name} must be a four-digit season.`);
  }
  return value;
}

function managerName(season: HistoricalSeason, team: HistoricalTeam) {
  const names = team.managerIds.flatMap((managerId) => {
    const manager = season.managers.find(
      (candidate) => candidate.id === managerId,
    );
    return manager ? [manager.displayName] : [];
  });
  return names.length ? names.join(" & ") : null;
}

function rowsFor(season: HistoricalSeason) {
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

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const firstSeason = seasonFromEnv(
    "ESPN_HISTORY_START_SEASON",
    HISTORY_SEASONS[0],
  );
  const lastSeason = seasonFromEnv(
    "ESPN_HISTORY_END_SEASON",
    HISTORY_SEASONS.at(-1)!,
  );
  if (firstSeason > lastSeason) {
    throw new Error("ESPN_HISTORY_START_SEASON cannot be after the end season.");
  }
  const requestedSeasons = Array.from(
    { length: lastSeason - firstSeason + 1 },
    (_, index) => firstSeason + index,
  );
  const history = await fetchEspnHistory({ seasons: requestedSeasons });
  const supabase = dryRun
    ? null
    : createClient(
        required("NEXT_PUBLIC_SUPABASE_URL"),
        required("SUPABASE_SECRET_KEY"),
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
        },
      );

  for (const season of history) {
    const { teams, games, regularSeasonWeeks } = rowsFor(season);
    if (!supabase) {
      console.log(
        `Checked ${season.season}: ${teams.length} teams and ${games.length} completed games.`,
      );
      continue;
    }

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

    const snapshotResult = await supabase
      .from("espn_season_snapshots")
      .upsert(
        {
          league_id: season.leagueId,
          season: season.season,
          fetched_at: importedAt,
          source_payload: season,
        },
        { onConflict: "league_id,season" },
      );
    if (snapshotResult.error) throw snapshotResult.error;

    console.log(
      `Imported ${season.season}: ${teams.length} teams and ${games.length} completed games.`,
    );
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown import error";
  console.error(`History import failed: ${message}`);
  process.exitCode = 1;
});
