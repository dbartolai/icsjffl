import type {
  HistoricalMatchup,
  HistoricalSeason,
  HistoricalTeam,
} from "../espn/history-types";

export type TeamGame = {
  matchupId: string;
  season: number;
  week: number;
  teamId: string;
  opponentTeamId: string;
  points: number;
  opponentPoints: number;
  margin: number;
  result: "win" | "loss" | "tie";
};

export type TeamAllTimeSummary = {
  teamId: string;
  latestName: string;
  seasons: number;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  championships: number;
};

export type RecordBook = {
  highestScores: TeamGame[];
  biggestBlowouts: TeamGame[];
  closestGames: HistoricalMatchup[];
  mostPointsInLoss: TeamGame[];
  lowestScoresInWin: TeamGame[];
  champions: Array<{ season: number; team: HistoricalTeam }>;
  teamSummaries: TeamAllTimeSummary[];
};

export function matchupGames(matchup: HistoricalMatchup): TeamGame[] {
  const margin = matchup.homeScore - matchup.awayScore;
  const result = (value: number): TeamGame["result"] =>
    value > 0 ? "win" : value < 0 ? "loss" : "tie";
  return [
    {
      matchupId: matchup.id,
      season: matchup.season,
      week: matchup.week,
      teamId: matchup.homeTeamId,
      opponentTeamId: matchup.awayTeamId,
      points: matchup.homeScore,
      opponentPoints: matchup.awayScore,
      margin,
      result: result(margin),
    },
    {
      matchupId: matchup.id,
      season: matchup.season,
      week: matchup.week,
      teamId: matchup.awayTeamId,
      opponentTeamId: matchup.homeTeamId,
      points: matchup.awayScore,
      opponentPoints: matchup.homeScore,
      margin: -margin,
      result: result(-margin),
    },
  ];
}

function top<T>(items: T[], compare: (a: T, b: T) => number, limit: number) {
  return [...items].sort(compare).slice(0, limit);
}

export function calculateRecordBook(
  seasons: readonly HistoricalSeason[],
  limit = 10,
): RecordBook {
  const matchups = seasons.flatMap((season) => season.matchups);
  const games = matchups.flatMap(matchupGames);
  const winners = games.filter((game) => game.result === "win");
  const losers = games.filter((game) => game.result === "loss");
  const summaries = new Map<string, TeamAllTimeSummary>();

  for (const season of [...seasons].sort((a, b) => a.season - b.season)) {
    for (const team of season.teams) {
      const summary = summaries.get(team.id) ?? {
        teamId: team.id,
        latestName: team.name,
        seasons: 0,
        wins: 0,
        losses: 0,
        ties: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        championships: 0,
      };
      summary.latestName = team.name;
      summary.seasons += 1;
      summary.wins += team.wins;
      summary.losses += team.losses;
      summary.ties += team.ties;
      summary.pointsFor += team.pointsFor;
      summary.pointsAgainst += team.pointsAgainst;
      if (season.championTeamId === team.id) summary.championships += 1;
      summaries.set(team.id, summary);
    }
  }

  return {
    highestScores: top(
      games,
      (a, b) => b.points - a.points || b.season - a.season || b.week - a.week,
      limit,
    ),
    biggestBlowouts: top(
      winners,
      (a, b) => b.margin - a.margin || b.points - a.points,
      limit,
    ),
    closestGames: top(
      matchups,
      (a, b) =>
        Math.abs(a.homeScore - a.awayScore) -
          Math.abs(b.homeScore - b.awayScore) ||
        b.season - a.season,
      limit,
    ),
    mostPointsInLoss: top(
      losers,
      (a, b) => b.points - a.points || b.season - a.season,
      limit,
    ),
    lowestScoresInWin: top(
      winners,
      (a, b) => a.points - b.points || b.season - a.season,
      limit,
    ),
    champions: seasons.flatMap((season) => {
      if (!season.championTeamId) return [];
      const team = season.teams.find(
        (candidate) => candidate.id === season.championTeamId,
      );
      return team ? [{ season: season.season, team }] : [];
    }),
    teamSummaries: [...summaries.values()].sort(
      (a, b) =>
        b.championships - a.championships ||
        b.wins - a.wins ||
        b.pointsFor - a.pointsFor,
    ),
  };
}

