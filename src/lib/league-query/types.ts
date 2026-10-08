export type LeagueCitation = {
  path: string;
  season: number;
  week?: number;
  gameId?: string;
  teamId?: string;
};

export type TeamReference = {
  teamId: string;
  teamName: string;
  managerName: string | null;
  citation: LeagueCitation;
};

export type LeagueQueryInput =
  | { operation: "biggest-blowouts"; season?: number; limit?: number }
  | {
      operation: "highest-scores";
      season?: number;
      limit?: number;
      lossesOnly?: boolean;
    }
  | {
      operation: "head-to-head";
      teamAId: string;
      teamBId: string;
      season?: number;
    }
  | { operation: "season-standings"; season: number }
  | {
      operation: "team-season-summary";
      season: number;
      teamId?: string;
      managerName?: string;
    }
  | {
      operation: "record";
      kind: "highest-score" | "biggest-blowout" | "most-points-in-loss";
      season?: number;
    };

type QueryScope = {
  seasons: number[];
  partialSeasons: number[];
  hasPartialSeason: boolean;
};

export type ScoredGame = {
  season: number;
  week: number;
  gameId: string;
  teamId: string;
  opponentTeamId: string;
  points: number;
  opponentPoints: number;
  margin: number;
  result: "win" | "loss" | "tie";
  citation: LeagueCitation;
};

export type HeadToHeadSummary = {
  teamA: TeamReference;
  teamB: TeamReference;
  games: number;
  teamAWins: number;
  teamBWins: number;
  ties: number;
  teamAPoints: number;
  teamBPoints: number;
  gamesPlayed: ScoredGame[];
};

export type StandingsEntry = TeamReference & {
  rank: number;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  finalRank: number | null;
};

export type TeamSeasonSummary = TeamReference & {
  games: number;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  pointsForPerGame: number;
  pointsAgainstPerGame: number;
  pointDifferentialPerGame: number;
  allPlayPct: number;
  expectedWins: number;
  scheduleLuck: number;
};

export type LeagueQueryResult =
  | {
      status: "ok";
      operation: LeagueQueryInput["operation"];
      scope: QueryScope;
      data:
        | { kind: "scored-games"; games: ScoredGame[] }
        | { kind: "head-to-head"; summary: HeadToHeadSummary }
        | { kind: "standings"; standings: StandingsEntry[] }
        | { kind: "team-season-summary"; summary: TeamSeasonSummary }
        | { kind: "record"; record: ScoredGame | null };
    }
  | {
      status: "no-data";
      operation: LeagueQueryInput["operation"];
      reason:
        | "unavailable-season"
        | "unknown-team"
        | "no-matching-games"
        | "no-record";
      requestedSeason?: number;
      availableSeasons: number[];
    }
  | {
      status: "resolution-needed";
      operation: "team-season-summary";
      reason: "unknown-manager" | "ambiguous-manager" | "unknown-team";
      candidates: TeamReference[];
    }
  | {
      status: "invalid-input";
      operation: LeagueQueryInput["operation"];
      errors: string[];
    };
