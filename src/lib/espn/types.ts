import { z } from "zod";

const score = z.object({
  teamId: z.number().int(),
  totalPoints: z.number().optional(),
  pointsByScoringPeriod: z.record(z.string(), z.number()).optional(),
});

// Validate the fields we use; ESPN's additional fields stay at this boundary.
export const espnLeagueSchema = z.object({
  id: z.number().int(),
  seasonId: z.number().int(),
  scoringPeriodId: z.number().int(),
  status: z
    .object({ currentMatchupPeriod: z.number().int().optional() })
    .optional(),
  settings: z.object({
    name: z.string(),
    scheduleSettings: z
      .object({
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
      rankCalculatedFinal: z.number().optional(),
      playoffSeed: z.number().optional(),
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
      roster: z
        .object({
          entries: z
            .array(
              z.object({
                playerPoolEntry: z.object({
                  player: z.object({
                    id: z.number().int(),
                    fullName: z.string(),
                    defaultPositionId: z.number().optional(),
                    proTeamId: z.number().optional(),
                  }),
                }),
              }),
            )
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
        home: score.optional(),
        away: score.optional(),
      }),
    )
    .optional(),
});

export type EspnLeague = z.infer<typeof espnLeagueSchema>;
