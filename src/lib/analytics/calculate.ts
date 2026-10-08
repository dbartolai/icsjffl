import type {
  AnalyticsArchive,
  AnalyticsGame,
  FranchiseAnalytics,
  LeagueAnalytics,
  RivalryAnalytics,
} from "./types";

type TeamAccumulator = {
  seasons: Set<number>;
  scores: number[];
  pointsAgainst: number;
  wins: number;
  losses: number;
  ties: number;
  allPlayWins: number;
  allPlayLosses: number;
  allPlayTies: number;
  expectedWins: number;
};

type RivalryAccumulator = Omit<
  RivalryAnalytics,
  "teamAName" | "teamBName" | "pointMargin"
>;

function average(values: readonly number[]) {
  if (!values.length) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function standardDeviation(values: readonly number[]) {
  if (!values.length) return 0;
  const mean = average(values);
  return Math.sqrt(
    values.reduce((total, value) => total + (value - mean) ** 2, 0) /
      values.length,
  );
}

function teamEntries(game: AnalyticsGame) {
  return [
    {
      teamId: game.homeTeamId,
      score: game.homeScore,
      opponentScore: game.awayScore,
    },
    {
      teamId: game.awayTeamId,
      score: game.awayScore,
      opponentScore: game.homeScore,
    },
  ];
}

function result(score: number, opponentScore: number) {
  return score > opponentScore ? "win" : score < opponentScore ? "loss" : "tie";
}

function getAccumulator(
  accumulators: Map<string, TeamAccumulator>,
  teamId: string,
) {
  const existing = accumulators.get(teamId);
  if (existing) return existing;
  const created: TeamAccumulator = {
    seasons: new Set(),
    scores: [],
    pointsAgainst: 0,
    wins: 0,
    losses: 0,
    ties: 0,
    allPlayWins: 0,
    allPlayLosses: 0,
    allPlayTies: 0,
    expectedWins: 0,
  };
  accumulators.set(teamId, created);
  return created;
}

function selectBy<T>(
  items: readonly T[],
  compare: (candidate: T, selected: T) => number,
) {
  return items.reduce<T | null>(
    (selected, candidate) =>
      selected === null || compare(candidate, selected) > 0
        ? candidate
        : selected,
    null,
  );
}

export function calculateLeagueAnalytics(
  archive: AnalyticsArchive,
  requestedSeason: number | null,
): LeagueAnalytics {
  const availableSeasons = [...new Set(archive.seasons.map(({ season }) => season))]
    .sort((a, b) => b - a);
  const selectedSeason =
    requestedSeason !== null && availableSeasons.includes(requestedSeason)
      ? requestedSeason
      : null;
  const includedSeasons = new Set(
    selectedSeason === null ? availableSeasons : [selectedSeason],
  );
  const scopedTeams = archive.teams.filter(({ season }) => includedSeasons.has(season));
  const games = archive.games
    .filter(({ season, isPlayoff }) => includedSeasons.has(season) && !isPlayoff)
    .sort(
      (a, b) =>
        a.season - b.season ||
        a.week - b.week ||
        a.gameId.localeCompare(b.gameId),
    );
  const leagueName =
    archive.seasons.find(({ season }) => includedSeasons.has(season))?.leagueName ??
    "ICSJ FFL";

  const names = new Map<
    string,
    { teamName: string; managerName: string | null; season: number }
  >();
  for (const team of [...scopedTeams].sort((a, b) => a.season - b.season)) {
    names.set(team.teamId, {
      teamName: team.teamName,
      managerName: team.managerName,
      season: team.season,
    });
  }

  const accumulators = new Map<string, TeamAccumulator>();
  for (const team of scopedTeams) {
    getAccumulator(accumulators, team.teamId).seasons.add(team.season);
  }

  for (const game of games) {
    for (const entry of teamEntries(game)) {
      const accumulator = getAccumulator(accumulators, entry.teamId);
      accumulator.seasons.add(game.season);
      accumulator.scores.push(entry.score);
      accumulator.pointsAgainst += entry.opponentScore;
      const gameResult = result(entry.score, entry.opponentScore);
      if (gameResult === "win") accumulator.wins += 1;
      else if (gameResult === "loss") accumulator.losses += 1;
      else accumulator.ties += 1;
    }
  }

  const gamesByWeek = new Map<string, AnalyticsGame[]>();
  for (const game of games) {
    const key = `${game.season}-${game.week}`;
    gamesByWeek.set(key, [...(gamesByWeek.get(key) ?? []), game]);
  }
  for (const weekGames of gamesByWeek.values()) {
    const entries = weekGames.flatMap(teamEntries);
    for (const entry of entries) {
      const accumulator = getAccumulator(accumulators, entry.teamId);
      let wins = 0;
      let losses = 0;
      let ties = 0;
      for (const opponent of entries) {
        if (opponent.teamId === entry.teamId) continue;
        const comparison = result(entry.score, opponent.score);
        if (comparison === "win") wins += 1;
        else if (comparison === "loss") losses += 1;
        else ties += 1;
      }
      accumulator.allPlayWins += wins;
      accumulator.allPlayLosses += losses;
      accumulator.allPlayTies += ties;
      const possible = wins + losses + ties;
      accumulator.expectedWins += possible ? (wins + ties / 2) / possible : 0;
    }
  }

  const allScores = games.flatMap((game) => [game.homeScore, game.awayScore]);
  const leagueAverage = average(allScores);
  const franchises = [...accumulators.entries()]
    .flatMap(([teamId, accumulator]): FranchiseAnalytics[] => {
      if (!accumulator.scores.length) return [];
      const gamesPlayed = accumulator.scores.length;
      const pointsFor = accumulator.scores.reduce((total, score) => total + score, 0);
      const pointsForPerGame = pointsFor / gamesPlayed;
      const pointsAgainstPerGame = accumulator.pointsAgainst / gamesPlayed;
      const allPlayGames =
        accumulator.allPlayWins +
        accumulator.allPlayLosses +
        accumulator.allPlayTies;
      const actualWinEquivalents = accumulator.wins + accumulator.ties / 2;
      const identity = names.get(teamId);
      return [
        {
          teamId,
          teamName: identity?.teamName ?? `Team ${teamId}`,
          managerName: identity?.managerName ?? null,
          seasons: accumulator.seasons.size,
          games: gamesPlayed,
          wins: accumulator.wins,
          losses: accumulator.losses,
          ties: accumulator.ties,
          pointsFor,
          pointsAgainst: accumulator.pointsAgainst,
          pointsForPerGame,
          pointsAgainstPerGame,
          pointsForVsAverage: pointsForPerGame - leagueAverage,
          pointsAgainstVsAverage: pointsAgainstPerGame - leagueAverage,
          pointDifferentialPerGame: pointsForPerGame - pointsAgainstPerGame,
          allPlayWins: accumulator.allPlayWins,
          allPlayLosses: accumulator.allPlayLosses,
          allPlayTies: accumulator.allPlayTies,
          allPlayPct: allPlayGames
            ? (accumulator.allPlayWins + accumulator.allPlayTies / 2) /
              allPlayGames
            : 0,
          expectedWins: accumulator.expectedWins,
          scheduleLuck: actualWinEquivalents - accumulator.expectedWins,
          weeklyAverage: average(accumulator.scores),
          weeklyStandardDeviation: standardDeviation(accumulator.scores),
          highScore: Math.max(...accumulator.scores),
          lowScore: Math.min(...accumulator.scores),
        },
      ];
    })
    .sort(
      (a, b) =>
        b.allPlayPct - a.allPlayPct ||
        b.pointDifferentialPerGame - a.pointDifferentialPerGame ||
        a.teamName.localeCompare(b.teamName),
    );

  const rivalryMap = new Map<string, RivalryAccumulator>();
  for (const game of games) {
    const [teamAId, teamBId] = [game.homeTeamId, game.awayTeamId].sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true }),
    );
    const homeIsA = game.homeTeamId === teamAId;
    const teamAScore = homeIsA ? game.homeScore : game.awayScore;
    const teamBScore = homeIsA ? game.awayScore : game.homeScore;
    const id = `${teamAId}-${teamBId}`;
    const rivalry = rivalryMap.get(id) ?? {
      id,
      teamAId,
      teamAWins: 0,
      teamAPoints: 0,
      teamBId,
      teamBWins: 0,
      teamBPoints: 0,
      ties: 0,
      games: 0,
    };
    rivalry.games += 1;
    rivalry.teamAPoints += teamAScore;
    rivalry.teamBPoints += teamBScore;
    if (teamAScore > teamBScore) rivalry.teamAWins += 1;
    else if (teamBScore > teamAScore) rivalry.teamBWins += 1;
    else rivalry.ties += 1;
    rivalryMap.set(id, rivalry);
  }
  const rivalries = [...rivalryMap.values()]
    .map<RivalryAnalytics>((rivalry) => ({
      ...rivalry,
      teamAName: names.get(rivalry.teamAId)?.teamName ?? `Team ${rivalry.teamAId}`,
      teamBName: names.get(rivalry.teamBId)?.teamName ?? `Team ${rivalry.teamBId}`,
      pointMargin: rivalry.teamAPoints - rivalry.teamBPoints,
    }))
    .sort(
      (a, b) =>
        b.games - a.games ||
        Math.abs(a.teamAWins - a.teamBWins) -
          Math.abs(b.teamAWins - b.teamBWins) ||
        Math.abs(a.pointMargin) - Math.abs(b.pointMargin) ||
        a.id.localeCompare(b.id),
    );

  const eligibleForConsistency = franchises.filter(({ games }) => games >= 2);

  return {
    leagueName,
    availableSeasons,
    selectedSeason,
    scopeLabel: selectedSeason === null ? "All-time" : `${selectedSeason} season`,
    totals: {
      seasons: selectedSeason === null ? includedSeasons.size : 1,
      franchises: franchises.length,
      matchups: games.length,
      averageScore: leagueAverage,
    },
    franchises,
    rivalries,
    insights: {
      mostFortunate: selectBy(
        franchises,
        (candidate, selected) => candidate.scheduleLuck - selected.scheduleLuck,
      ),
      toughestSchedule: selectBy(
        franchises,
        (candidate, selected) =>
          candidate.pointsAgainstPerGame - selected.pointsAgainstPerGame,
      ),
      mostConsistent: selectBy(
        eligibleForConsistency,
        (candidate, selected) =>
          selected.weeklyStandardDeviation - candidate.weeklyStandardDeviation,
      ),
      mostVolatile: selectBy(
        eligibleForConsistency,
        (candidate, selected) =>
          candidate.weeklyStandardDeviation - selected.weeklyStandardDeviation,
      ),
    },
    limitations: [
      "Schedule and scoring metrics use completed regular-season matchups. Playoff games are excluded so every weekly comparison stays on the same footing.",
      "The archive stores final weekly scores, not lineup or bench totals. Bench-efficiency claims need a future lineup-level data source.",
    ],
  };
}
