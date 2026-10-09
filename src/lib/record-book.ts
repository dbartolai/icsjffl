import "server-only";

import type { RecordBookData, RecordLeader } from "@/components/record-book/RecordBookView";
import { fetchEspnHistory, HISTORY_SEASONS } from "@/lib/espn/history";
import type {
  HistoricalMatchup,
  HistoricalSeason,
  HistoricalTeam,
} from "@/lib/espn/history-types";
import { calculateRecordBook, type TeamGame } from "@/lib/records/calculate";
import {
  getStoredLeagueHistory,
  type StoredLeagueHistory,
} from "@/lib/supabase/history";

function storedHistoryToSeasons(history: StoredLeagueHistory): HistoricalSeason[] {
  return history.seasons
    .map((seasonRow) => {
      const teamRows = history.teams.filter(
        (team) => team.season === seasonRow.season,
      );
      const managers = teamRows.flatMap((team) =>
        team.manager_name
          ? [{ id: `team-${team.team_id}`, displayName: team.manager_name }]
          : [],
      );
      const teams: HistoricalTeam[] = teamRows.map((team) => ({
        id: team.team_id,
        season: team.season,
        name: team.team_name,
        abbreviation: team.abbreviation ?? team.team_name.slice(0, 3).toUpperCase(),
        managerIds: team.manager_name ? [`team-${team.team_id}`] : [],
        wins: team.wins,
        losses: team.losses,
        ties: team.ties,
        pointsFor: team.points_for,
        pointsAgainst: team.points_against,
        finalRank: team.final_rank,
      }));
      const matchups: HistoricalMatchup[] = history.games
        .filter((game) => game.season === seasonRow.season)
        .map((game) => ({
          id: `${game.season}-${game.week}-${game.game_id}`,
          season: game.season,
          week: game.week,
          matchupPeriod: game.matchup_period,
          homeTeamId: game.home_team_id,
          awayTeamId: game.away_team_id,
          homeScore: game.home_score,
          awayScore: game.away_score,
          isPlayoff: game.is_playoff,
        }));

      return {
        leagueId: seasonRow.league_id,
        leagueName: seasonRow.league_name,
        season: seasonRow.season,
        managers,
        teams,
        matchups,
        draftPicks: [],
        championTeamId: seasonRow.is_complete
          ? teams.find((team) => team.finalRank === 1)?.id ?? null
          : null,
      } satisfies HistoricalSeason;
    })
    .sort((a, b) => a.season - b.season);
}

async function loadSeasons(selectedSeason: number | null) {
  const leagueId = process.env.ESPN_LEAGUE_ID?.trim();
  if (leagueId) {
    try {
      const stored = await getStoredLeagueHistory(leagueId);
      if (stored) {
        const seasons = storedHistoryToSeasons(stored);
        return selectedSeason
          ? seasons.filter((season) => season.season === selectedSeason)
          : seasons;
      }
    } catch {
      // The ESPN fallback keeps local development usable before the migration/import.
    }
  }

  return fetchEspnHistory(
    selectedSeason ? { seasons: [selectedSeason] } : undefined,
  );
}

function teamFor(
  seasons: readonly HistoricalSeason[],
  season: number,
  teamId: string,
) {
  return seasons
    .find((candidate) => candidate.season === season)
    ?.teams.find((team) => team.id === teamId);
}

function managerFor(
  seasons: readonly HistoricalSeason[],
  season: number,
  teamId: string,
) {
  const historicalSeason = seasons.find(
    (candidate) => candidate.season === season,
  );
  const team = historicalSeason?.teams.find((candidate) => candidate.id === teamId);
  if (!historicalSeason || !team) return undefined;
  const names = team.managerIds.flatMap((managerId) => {
    const manager = historicalSeason.managers.find(
      (candidate) => candidate.id === managerId,
    );
    return manager ? [manager.displayName] : [];
  });
  return names.length ? names.join(" & ") : undefined;
}

function leader(
  seasons: readonly HistoricalSeason[],
  game: TeamGame,
  rank: number,
  value: number,
): RecordLeader {
  return {
    rank,
    team: teamFor(seasons, game.season, game.teamId)?.name ?? "Unknown team",
    teamId: game.teamId,
    owner: managerFor(seasons, game.season, game.teamId),
    value,
    season: game.season,
    week: game.week,
  };
}

export async function getRecordBookData(
  selectedSeason: number | null,
): Promise<RecordBookData> {
  const seasons = await loadSeasons(selectedSeason);
  if (!seasons.length) throw new Error("No league history is available.");

  const records = calculateRecordBook(seasons, 10);
  const highScore = records.highestScores[0];
  const blowout = records.biggestBlowouts[0];
  const highLoss = records.mostPointsInLoss[0];
  const lowWin = records.lowestScoresInWin[0];
  const blowoutTeam = blowout
    ? teamFor(seasons, blowout.season, blowout.teamId)
    : undefined;
  const blowoutOpponent = blowout
    ? teamFor(seasons, blowout.season, blowout.opponentTeamId)
    : undefined;
  const allMatchups = seasons.flatMap((season) => season.matchups);

  const recordCards: RecordBookData["records"] = [];
  if (highScore) {
    recordCards.push({
      id: "high-score",
      label: "Most points in a game",
      value: highScore.points,
      unit: "pts",
      team: teamFor(seasons, highScore.season, highScore.teamId)?.name ?? "Unknown team",
      teamId: highScore.teamId,
      opponent:
        teamFor(seasons, highScore.season, highScore.opponentTeamId)?.name,
      season: highScore.season,
      week: highScore.week,
    });
  }
  if (blowout) {
    recordCards.push({
      id: "blowout",
      label: "Largest margin of victory",
      value: blowout.margin,
      unit: "pts",
      team: blowoutTeam?.name ?? "Unknown team",
      teamId: blowout.teamId,
      opponent: blowoutOpponent?.name,
      season: blowout.season,
      week: blowout.week,
      note: `${blowout.points.toFixed(2)}–${blowout.opponentPoints.toFixed(2)}`,
    });
  }
  if (highLoss) {
    recordCards.push({
      id: "high-loss",
      label: "Most points in a loss",
      value: highLoss.points,
      unit: "pts",
      team: teamFor(seasons, highLoss.season, highLoss.teamId)?.name ?? "Unknown team",
      teamId: highLoss.teamId,
      opponent:
        teamFor(seasons, highLoss.season, highLoss.opponentTeamId)?.name,
      season: highLoss.season,
      week: highLoss.week,
      note: `Lost ${highLoss.points.toFixed(2)}–${highLoss.opponentPoints.toFixed(2)}`,
    });
  }
  if (lowWin) {
    recordCards.push({
      id: "low-win",
      label: "Lowest score in a win",
      value: lowWin.points,
      unit: "pts",
      team: teamFor(seasons, lowWin.season, lowWin.teamId)?.name ?? "Unknown team",
      teamId: lowWin.teamId,
      opponent: teamFor(seasons, lowWin.season, lowWin.opponentTeamId)?.name,
      season: lowWin.season,
      week: lowWin.week,
      note: `Won ${lowWin.points.toFixed(2)}–${lowWin.opponentPoints.toFixed(2)}`,
    });
  }

  const franchiseLeaders = [...records.teamSummaries]
    .sort((a, b) => b.wins - a.wins || b.championships - a.championships)
    .map((summary, index) => {
      const latestSeason = [...seasons]
        .sort((a, b) => b.season - a.season)
        .find((season) => season.teams.some((team) => team.id === summary.teamId));
      const games = summary.wins + summary.losses + summary.ties;
      return {
        rank: index + 1,
        team: summary.latestName,
        teamId: summary.teamId,
        owner: latestSeason
          ? managerFor(seasons, latestSeason.season, summary.teamId)
          : undefined,
        wins: summary.wins,
        winPct: games ? (summary.wins + summary.ties / 2) / games : 0,
        championships: summary.championships,
      };
    });

  const recentSeasons = [...seasons]
    .sort((a, b) => b.season - a.season)
    .slice(0, 3)
    .map((season) => {
      const champion = season.championTeamId
        ? season.teams.find((team) => team.id === season.championTeamId)
        : undefined;
      const runnerUp = season.teams.find((team) => team.finalRank === 2);
      const topScorer = [...season.teams].sort(
        (a, b) => b.pointsFor - a.pointsFor,
      )[0];
      return {
        season: season.season,
        champion: champion?.name,
        runnerUp: runnerUp?.name,
        topScorer: topScorer?.name,
        points: topScorer?.pointsFor,
      };
    });

  const scope = selectedSeason ? `the ${selectedSeason} season` : "league history";
  return {
    leagueName: seasons[0].leagueName,
    seasons: HISTORY_SEASONS,
    selectedSeason,
    totals: {
      seasons: seasons.length,
      matchups: allMatchups.length,
      points: allMatchups.reduce(
        (total, matchup) => total + matchup.homeScore + matchup.awayScore,
        0,
      ),
    },
    headline: {
      eyebrow: selectedSeason ? `${selectedSeason} SEASON ARCHIVE` : "FROM THE LEAGUE ARCHIVE",
      title: blowout
        ? `${blowoutTeam?.name ?? "One team"} owns the biggest blowout in ${scope}.`
        : `The ${scope} archive is ready.`,
      summary: blowout
        ? `${blowoutTeam?.name ?? "The winner"} beat ${blowoutOpponent?.name ?? "their opponent"} ${blowout.points.toFixed(2)}–${blowout.opponentPoints.toFixed(2)} in Week ${blowout.week} of ${blowout.season}, a ${blowout.margin.toFixed(2)}-point margin.`
        : "Completed matchups will appear here as the archive grows.",
    },
    records: recordCards,
    scoringLeaders: records.highestScores
      .slice(0, 5)
      .map((game, index) => leader(seasons, game, index + 1, game.points)),
    blowoutLeaders: records.biggestBlowouts
      .slice(0, 5)
      .map((game, index) => leader(seasons, game, index + 1, game.margin)),
    franchiseLeaders,
    recentSeasons,
  };
}
