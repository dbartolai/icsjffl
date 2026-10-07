export interface FantasyPlayer {
  id: string;
  name: string;
  position: string;
  proTeamId: number | null;
}

export interface FantasyTeam {
  id: string;
  name: string;
  abbreviation: string;
  manager: string;
  rank: number;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  roster: FantasyPlayer[];
}

export interface FantasyMatchup {
  id: string;
  week: number;
  homeTeamId: string;
  awayTeamId: string | null;
  homeScore: number | null;
  awayScore: number | null;
}

export interface FantasyLeague {
  id: string;
  name: string;
  season: number;
  currentWeek: number;
  teams: FantasyTeam[];
  matchups: FantasyMatchup[];
}

export interface LeagueData {
  source: "espn" | "mock";
  league: FantasyLeague;
}
