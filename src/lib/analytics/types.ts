export type AnalyticsSeason = {
  season: number;
  leagueName: string;
  regularSeasonWeeks: number | null;
  isComplete: boolean;
};

export type AnalyticsTeam = {
  season: number;
  teamId: string;
  teamName: string;
  managerName: string | null;
};

export type AnalyticsGame = {
  season: number;
  gameId: string;
  week: number;
  isPlayoff: boolean;
  homeTeamId: string;
  homeScore: number;
  awayTeamId: string;
  awayScore: number;
};

export type AnalyticsArchive = {
  seasons: AnalyticsSeason[];
  teams: AnalyticsTeam[];
  games: AnalyticsGame[];
};

export type FranchiseAnalytics = {
  teamId: string;
  teamName: string;
  managerName: string | null;
  seasons: number;
  games: number;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  pointsForPerGame: number;
  pointsAgainstPerGame: number;
  pointsForVsAverage: number;
  pointsAgainstVsAverage: number;
  pointDifferentialPerGame: number;
  allPlayWins: number;
  allPlayLosses: number;
  allPlayTies: number;
  allPlayPct: number;
  expectedWins: number;
  scheduleLuck: number;
  weeklyAverage: number;
  weeklyStandardDeviation: number;
  highScore: number;
  lowScore: number;
};

export type RivalryAnalytics = {
  id: string;
  teamAId: string;
  teamAName: string;
  teamAWins: number;
  teamAPoints: number;
  teamBId: string;
  teamBName: string;
  teamBWins: number;
  teamBPoints: number;
  ties: number;
  games: number;
  pointMargin: number;
};

export type LeagueAnalytics = {
  leagueName: string;
  availableSeasons: number[];
  selectedSeason: number | null;
  scopeLabel: string;
  totals: {
    seasons: number;
    franchises: number;
    matchups: number;
    averageScore: number;
  };
  franchises: FranchiseAnalytics[];
  rivalries: RivalryAnalytics[];
  insights: {
    mostFortunate: FranchiseAnalytics | null;
    toughestSchedule: FranchiseAnalytics | null;
    mostConsistent: FranchiseAnalytics | null;
    mostVolatile: FranchiseAnalytics | null;
  };
  limitations: string[];
};
