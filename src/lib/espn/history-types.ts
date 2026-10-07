export type HistoricalManager = {
  id: string;
  displayName: string;
};

export type HistoricalTeam = {
  id: string;
  season: number;
  name: string;
  abbreviation: string;
  managerIds: string[];
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  finalRank: number | null;
};

export type HistoricalMatchup = {
  id: string;
  season: number;
  week: number;
  matchupPeriod: number;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  isPlayoff: boolean | null;
};

export type HistoricalDraftPick = {
  season: number;
  teamId: string;
  playerId: string;
  round: number;
  roundPick: number;
  overallPick: number;
};

export type HistoricalSeason = {
  leagueId: string;
  leagueName: string;
  season: number;
  managers: HistoricalManager[];
  teams: HistoricalTeam[];
  matchups: HistoricalMatchup[];
  draftPicks: HistoricalDraftPick[];
  championTeamId: string | null;
};

