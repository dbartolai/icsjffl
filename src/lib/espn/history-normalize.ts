import { z } from "zod";
import type {
  HistoricalDraftPick,
  HistoricalMatchup,
  HistoricalSeason,
  HistoricalTeam,
} from "./history-types";

const scoreSchema = z.object({
  teamId: z.number().int(),
  totalPoints: z.number().optional(),
  pointsByScoringPeriod: z.record(z.string(), z.number()).optional(),
});

const historicalLeagueSchema = z.object({
  id: z.number().int(),
  seasonId: z.number().int(),
  scoringPeriodId: z.number().int().optional(),
  status: z
    .object({
      isActive: z.boolean().optional(),
      latestScoringPeriod: z.number().int().optional(),
      finalScoringPeriod: z.number().int().optional(),
    })
    .optional(),
  settings: z.object({
    name: z.string(),
    scheduleSettings: z
      .object({
        matchupPeriodCount: z.number().int().optional(),
        matchupPeriods: z.record(z.string(), z.array(z.number())).optional(),
      })
      .optional(),
  }),
  members: z
    .array(
      z.object({
        id: z.string(),
        displayName: z.string().optional(),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
      }),
    )
    .optional(),
  teams: z.array(
    z.object({
      id: z.number().int(),
      name: z.string().optional(),
      location: z.string().optional(),
      nickname: z.string().optional(),
      abbrev: z.string().optional(),
      owners: z.array(z.string()).optional(),
      primaryOwner: z.string().optional(),
      rankCalculatedFinal: z.number().optional(),
      record: z
        .object({
          overall: z
            .object({
              wins: z.number().optional(),
              losses: z.number().optional(),
              ties: z.number().optional(),
              pointsFor: z.number().optional(),
              pointsAgainst: z.number().optional(),
            })
            .optional(),
        })
        .optional(),
    }),
  ),
  schedule: z
    .array(
      z.object({
        id: z.number().int(),
        matchupPeriodId: z.number().int(),
        home: scoreSchema.optional(),
        away: scoreSchema.optional(),
      }),
    )
    .optional(),
  draftDetail: z
    .object({
      picks: z
        .array(
          z.object({
            teamId: z.number().int(),
            playerId: z.number().int(),
            roundId: z.number().int(),
            roundPickNumber: z.number().int(),
            overallPickNumber: z.number().int(),
          }),
        )
        .optional(),
    })
    .optional(),
});

type RawLeague = z.infer<typeof historicalLeagueSchema>;
type RawScore = z.infer<typeof scoreSchema>;

function teamName(team: RawLeague["teams"][number]) {
  return (
    team.name ||
    [team.location, team.nickname].filter(Boolean).join(" ") ||
    `Team ${team.id}`
  );
}

function normalizeTeam(team: RawLeague["teams"][number], season: number) {
  const name = teamName(team);
  const record = team.record?.overall;
  const managerIds = team.owners?.length
    ? team.owners
    : team.primaryOwner
      ? [team.primaryOwner]
      : [];
  return {
    id: String(team.id),
    season,
    name,
    abbreviation: team.abbrev || name.slice(0, 3).toUpperCase(),
    managerIds,
    wins: record?.wins ?? 0,
    losses: record?.losses ?? 0,
    ties: record?.ties ?? 0,
    pointsFor: record?.pointsFor ?? 0,
    pointsAgainst: record?.pointsAgainst ?? 0,
    finalRank:
      team.rankCalculatedFinal && team.rankCalculatedFinal > 0
        ? team.rankCalculatedFinal
        : null,
  } satisfies HistoricalTeam;
}

function scoreForWeek(
  side: RawScore,
  week: number,
  isSingleWeek: boolean,
) {
  return (
    side.pointsByScoringPeriod?.[String(week)] ??
    (isSingleWeek ? side.totalPoints : undefined)
  );
}

function normalizeMatchups(raw: RawLeague): HistoricalMatchup[] {
  const periods = raw.settings.scheduleSettings?.matchupPeriods;
  const regularSeasonPeriods =
    raw.settings.scheduleSettings?.matchupPeriodCount ?? null;
  const latestScoringPeriod =
    raw.status?.latestScoringPeriod ?? raw.scoringPeriodId ?? Infinity;
  const teamIds = new Set(raw.teams.map((team) => team.id));

  return (raw.schedule ?? []).flatMap((matchup) => {
    if (
      !matchup.home ||
      !matchup.away ||
      !teamIds.has(matchup.home.teamId) ||
      !teamIds.has(matchup.away.teamId)
    ) {
      return [];
    }
    const weeks = periods?.[String(matchup.matchupPeriodId)] ?? [
      matchup.matchupPeriodId,
    ];
    return weeks.flatMap((week) => {
      if (week > latestScoringPeriod) return [];
      const homeScore = scoreForWeek(matchup.home!, week, weeks.length === 1);
      const awayScore = scoreForWeek(matchup.away!, week, weeks.length === 1);
      // Future games and partially returned multi-week playoff games are omitted.
      if (
        homeScore === undefined ||
        awayScore === undefined ||
        (homeScore === 0 && awayScore === 0)
      ) {
        return [];
      }
      return [
        {
          id: `${raw.seasonId}-${week}-${matchup.id}`,
          season: raw.seasonId,
          week,
          matchupPeriod: matchup.matchupPeriodId,
          homeTeamId: String(matchup.home!.teamId),
          awayTeamId: String(matchup.away!.teamId),
          homeScore,
          awayScore,
          isPlayoff:
            regularSeasonPeriods === null
              ? null
              : matchup.matchupPeriodId > regularSeasonPeriods,
        },
      ];
    });
  });
}

function seasonIsFinal(raw: RawLeague) {
  const latest = raw.status?.latestScoringPeriod ?? raw.scoringPeriodId;
  const final = raw.status?.finalScoringPeriod;
  if (final !== undefined && latest !== undefined) return latest >= final;
  return raw.status?.isActive === false;
}

export function normalizeHistoricalSeason(
  response: unknown,
  expectedSeason?: number,
): HistoricalSeason {
  // ESPN's pre-2018 leagueHistory endpoint wraps the league in an array.
  const payload = Array.isArray(response) ? response[0] : response;
  const raw = historicalLeagueSchema.parse(payload);
  if (expectedSeason !== undefined && raw.seasonId !== expectedSeason) {
    throw new Error("ESPN season mismatch");
  }
  const teams = raw.teams.map((team) => normalizeTeam(team, raw.seasonId));
  const champion = seasonIsFinal(raw)
    ? teams.find((team) => team.finalRank === 1)?.id ?? null
    : null;
  const draftPicks: HistoricalDraftPick[] = (raw.draftDetail?.picks ?? []).map(
    (pick) => ({
      season: raw.seasonId,
      teamId: String(pick.teamId),
      playerId: String(pick.playerId),
      round: pick.roundId,
      roundPick: pick.roundPickNumber,
      overallPick: pick.overallPickNumber,
    }),
  );
  return {
    leagueId: String(raw.id),
    leagueName: raw.settings.name,
    season: raw.seasonId,
    managers: (raw.members ?? []).map((member) => ({
      id: member.id,
      displayName:
        member.displayName ||
        [member.firstName, member.lastName].filter(Boolean).join(" ") ||
        "Unknown manager",
    })),
    teams,
    matchups: normalizeMatchups(raw),
    draftPicks,
    championTeamId: champion,
  };
}
