import { calculateLeagueAnalytics } from "../analytics/calculate";
import { matchupGames, type TeamGame } from "../records/calculate";
import type {
  HistoricalSeason,
  HistoricalTeam,
} from "../espn/history-types";
import type {
  HeadToHeadSummary,
  LeagueCitation,
  LeagueQueryInput,
  LeagueQueryResult,
  ScoredGame,
  StandingsEntry,
  TeamReference,
  TeamSeasonSummary,
} from "./types";

export type {
  LeagueCitation,
  LeagueQueryInput,
  LeagueQueryResult,
  ScoredGame,
  StandingsEntry,
  TeamReference,
  TeamSeasonSummary,
} from "./types";

const MAX_LIMIT = 25;

function availableSeasons(seasons: readonly HistoricalSeason[]) {
  return [...new Set(seasons.map((season) => season.season))].sort((a, b) => a - b);
}

function citation(
  season: number,
  details: { week?: number; gameId?: string; teamId?: string },
): LeagueCitation {
  const segments = [`season/${season}`];
  if (details.week !== undefined) segments.push(`week/${details.week}`);
  if (details.gameId !== undefined) segments.push(`game/${details.gameId}`);
  if (details.teamId !== undefined) segments.push(`team/${details.teamId}`);
  return { path: segments.join("/"), season, ...details };
}

function managerName(
  season: HistoricalSeason,
  team: HistoricalTeam,
): string | null {
  const names = team.managerIds.flatMap((managerId) => {
    const manager = season.managers.find((candidate) => candidate.id === managerId);
    return manager ? [manager.displayName] : [];
  });
  return names.length ? names.join(" & ") : null;
}

function teamReference(season: HistoricalSeason, team: HistoricalTeam): TeamReference {
  return {
    teamId: team.id,
    teamName: team.name,
    managerName: managerName(season, team),
    citation: citation(season.season, { teamId: team.id }),
  };
}

function scoreGame(game: TeamGame): ScoredGame {
  const { matchupId, ...details } = game;
  return {
    ...details,
    gameId: matchupId,
    citation: citation(game.season, {
      week: game.week,
      gameId: matchupId,
      teamId: game.teamId,
    }),
  };
}

function scoreGames(seasons: readonly HistoricalSeason[]) {
  return seasons.flatMap((season) =>
    season.matchups.flatMap(matchupGames).map(scoreGame),
  );
}

function scope(seasons: readonly HistoricalSeason[]) {
  const partialSeasons = seasons
    .filter((season) => season.championTeamId === null)
    .map((season) => season.season)
    .sort((a, b) => a - b);
  return {
    seasons: availableSeasons(seasons),
    partialSeasons,
    hasPartialSeason: partialSeasons.length > 0,
  };
}

function validate(input: LeagueQueryInput) {
  const errors: string[] = [];
  const season = "season" in input ? input.season : undefined;
  if (season !== undefined && (!Number.isInteger(season) || season < 2000 || season > 2100)) {
    errors.push("Season must be an integer from 2000 through 2100.");
  }
  if ("limit" in input && input.limit !== undefined) {
    if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > MAX_LIMIT) {
      errors.push(`Limit must be an integer from 1 through ${MAX_LIMIT}.`);
    }
  }
  if (input.operation === "head-to-head") {
    if (!input.teamAId.trim() || !input.teamBId.trim()) {
      errors.push("Both franchise IDs are required.");
    } else if (input.teamAId === input.teamBId) {
      errors.push("Head-to-head requires two different franchise IDs.");
    }
  }
  if (input.operation === "team-season-summary") {
    const targets = Number(Boolean(input.teamId?.trim())) + Number(Boolean(input.managerName?.trim()));
    if (targets !== 1) errors.push("Provide exactly one of teamId or managerName.");
  }
  return errors;
}

function requestedSeasons(
  seasons: readonly HistoricalSeason[],
  operation: LeagueQueryInput["operation"],
  requestedSeason?: number,
): HistoricalSeason[] | LeagueQueryResult {
  if (requestedSeason === undefined) return [...seasons];
  const selected = seasons.filter((season) => season.season === requestedSeason);
  if (selected.length) return selected;
  return {
    status: "no-data",
    operation,
    reason: "unavailable-season",
    requestedSeason,
    availableSeasons: availableSeasons(seasons),
  };
}

function byNewestGame(a: ScoredGame, b: ScoredGame) {
  return b.season - a.season || b.week - a.week || a.gameId.localeCompare(b.gameId);
}

function seasonMatchups(seasons: readonly HistoricalSeason[]) {
  return seasons.flatMap((season) => season.matchups);
}

function unknownTeam(
  candidates: TeamReference[],
): LeagueQueryResult {
  return {
    status: "resolution-needed",
    operation: "team-season-summary",
    reason: "unknown-team",
    candidates,
  };
}

function toAnalyticsArchive(season: HistoricalSeason) {
  return {
    seasons: [
      {
        season: season.season,
        leagueName: season.leagueName,
        regularSeasonWeeks: null,
        isComplete: season.championTeamId !== null,
      },
    ],
    teams: season.teams.map((team) => ({
      season: season.season,
      teamId: team.id,
      teamName: team.name,
      managerName: managerName(season, team),
    })),
    games: season.matchups.map((game) => ({
      season: game.season,
      gameId: game.id,
      week: game.week,
      isPlayoff: game.isPlayoff === true,
      homeTeamId: game.homeTeamId,
      homeScore: game.homeScore,
      awayTeamId: game.awayTeamId,
      awayScore: game.awayScore,
    })),
  };
}

function teamSummary(
  season: HistoricalSeason,
  team: HistoricalTeam,
): TeamSeasonSummary | null {
  const analytics = calculateLeagueAnalytics(toAnalyticsArchive(season), season.season);
  const summary = analytics.franchises.find((candidate) => candidate.teamId === team.id);
  if (!summary) return null;
  return {
    ...teamReference(season, team),
    games: summary.games,
    wins: summary.wins,
    losses: summary.losses,
    ties: summary.ties,
    pointsFor: summary.pointsFor,
    pointsAgainst: summary.pointsAgainst,
    pointsForPerGame: summary.pointsForPerGame,
    pointsAgainstPerGame: summary.pointsAgainstPerGame,
    pointDifferentialPerGame: summary.pointDifferentialPerGame,
    allPlayPct: summary.allPlayPct,
    expectedWins: summary.expectedWins,
    scheduleLuck: summary.scheduleLuck,
  };
}

function headToHead(
  seasons: readonly HistoricalSeason[],
  teamAId: string,
  teamBId: string,
): HeadToHeadSummary | null {
  const firstSeason = seasons.find((season) =>
    season.teams.some((team) => team.id === teamAId),
  );
  const teamA = firstSeason?.teams.find((team) => team.id === teamAId);
  const secondSeason = seasons.find((season) =>
    season.teams.some((team) => team.id === teamBId),
  );
  const teamB = secondSeason?.teams.find((team) => team.id === teamBId);
  if (!firstSeason || !teamA || !secondSeason || !teamB) return null;

  const gamesPlayed = seasonMatchups(seasons)
    .filter(
      (game) =>
        (game.homeTeamId === teamAId && game.awayTeamId === teamBId) ||
        (game.homeTeamId === teamBId && game.awayTeamId === teamAId),
    )
    .flatMap((game) => matchupGames(game).filter((entry) => entry.teamId === teamAId))
    .map(scoreGame)
    .sort(byNewestGame);
  if (!gamesPlayed.length) return null;
  return {
    teamA: teamReference(firstSeason, teamA),
    teamB: teamReference(secondSeason, teamB),
    games: gamesPlayed.length,
    teamAWins: gamesPlayed.filter((game) => game.result === "win").length,
    teamBWins: gamesPlayed.filter((game) => game.result === "loss").length,
    ties: gamesPlayed.filter((game) => game.result === "tie").length,
    teamAPoints: gamesPlayed.reduce((total, game) => total + game.points, 0),
    teamBPoints: gamesPlayed.reduce((total, game) => total + game.opponentPoints, 0),
    gamesPlayed,
  };
}

export function queryLeagueHistory(
  source: readonly HistoricalSeason[],
  input: LeagueQueryInput,
): LeagueQueryResult {
  const errors = validate(input);
  if (errors.length) return { status: "invalid-input", operation: input.operation, errors };

  const selected = requestedSeasons(source, input.operation, input.season);
  if (!Array.isArray(selected)) return selected;

  if (input.operation === "biggest-blowouts") {
    const games = scoreGames(selected)
      .filter((game) => game.result === "win")
      .sort((a, b) => b.margin - a.margin || b.points - a.points || byNewestGame(a, b))
      .slice(0, input.limit ?? 10);
    return games.length
      ? { status: "ok", operation: input.operation, scope: scope(selected), data: { kind: "scored-games", games } }
      : { status: "no-data", operation: input.operation, reason: "no-matching-games", availableSeasons: availableSeasons(source) };
  }

  if (input.operation === "highest-scores") {
    const games = scoreGames(selected)
      .filter((game) => !input.lossesOnly || game.result === "loss")
      .sort((a, b) => b.points - a.points || byNewestGame(a, b))
      .slice(0, input.limit ?? 10);
    return games.length
      ? { status: "ok", operation: input.operation, scope: scope(selected), data: { kind: "scored-games", games } }
      : { status: "no-data", operation: input.operation, reason: "no-matching-games", availableSeasons: availableSeasons(source) };
  }

  if (input.operation === "head-to-head") {
    const knownTeamIds = new Set(selected.flatMap((season) => season.teams.map((team) => team.id)));
    if (!knownTeamIds.has(input.teamAId) || !knownTeamIds.has(input.teamBId)) {
      return {
        status: "no-data",
        operation: input.operation,
        reason: "unknown-team",
        availableSeasons: availableSeasons(source),
      };
    }
    const summary = headToHead(selected, input.teamAId, input.teamBId);
    return summary
      ? { status: "ok", operation: input.operation, scope: scope(selected), data: { kind: "head-to-head", summary } }
      : { status: "no-data", operation: input.operation, reason: "no-matching-games", availableSeasons: availableSeasons(source) };
  }

  if (input.operation === "season-standings") {
    const season = selected[0];
    const standings: StandingsEntry[] = [...season.teams]
      .sort(
        (a, b) =>
          (a.finalRank ?? Number.MAX_SAFE_INTEGER) - (b.finalRank ?? Number.MAX_SAFE_INTEGER) ||
          b.wins - a.wins ||
          b.pointsFor - a.pointsFor ||
          a.id.localeCompare(b.id),
      )
      .map((team, index) => ({
        ...teamReference(season, team),
        rank: team.finalRank ?? index + 1,
        wins: team.wins,
        losses: team.losses,
        ties: team.ties,
        pointsFor: team.pointsFor,
        pointsAgainst: team.pointsAgainst,
        finalRank: team.finalRank,
      }));
    return { status: "ok", operation: input.operation, scope: scope(selected), data: { kind: "standings", standings } };
  }

  if (input.operation === "team-season-summary") {
    const season = selected[0];
    const references = season.teams.map((team) => teamReference(season, team));
    let matches: HistoricalTeam[];
    if (input.teamId) {
      matches = season.teams.filter((team) => team.id === input.teamId);
      if (!matches.length) return unknownTeam(references);
    } else {
      const requestedManager = input.managerName!.trim().toLocaleLowerCase();
      matches = season.teams.filter(
        (team) => managerName(season, team)?.toLocaleLowerCase() === requestedManager,
      );
      if (!matches.length) {
        return { status: "resolution-needed", operation: input.operation, reason: "unknown-manager", candidates: references };
      }
      if (matches.length > 1) {
        return {
          status: "resolution-needed",
          operation: input.operation,
          reason: "ambiguous-manager",
          candidates: matches.map((team) => teamReference(season, team)),
        };
      }
    }
    const summary = teamSummary(season, matches[0]);
    return summary
      ? { status: "ok", operation: input.operation, scope: scope(selected), data: { kind: "team-season-summary", summary } }
      : { status: "no-data", operation: input.operation, reason: "no-matching-games", availableSeasons: availableSeasons(source) };
  }

  const games = scoreGames(selected);
  const record =
    input.kind === "highest-score"
      ? [...games].sort((a, b) => b.points - a.points || byNewestGame(a, b))[0]
      : input.kind === "biggest-blowout"
        ? [...games].filter((game) => game.result === "win").sort((a, b) => b.margin - a.margin || byNewestGame(a, b))[0]
        : [...games].filter((game) => game.result === "loss").sort((a, b) => b.points - a.points || byNewestGame(a, b))[0];
  return record
    ? { status: "ok", operation: input.operation, scope: scope(selected), data: { kind: "record", record } }
    : { status: "no-data", operation: input.operation, reason: "no-record", availableSeasons: availableSeasons(source) };
}
