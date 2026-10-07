import type { FantasyLeague, FantasyTeam } from "@/types/fantasy";
import { espnLeagueSchema } from "./types";

const positions: Record<number, string> = {
  1: "QB",
  2: "RB",
  3: "WR",
  4: "TE",
  5: "K",
  16: "D/ST",
};

export function normalizeLeague(response: unknown): FantasyLeague {
  const raw = espnLeagueSchema.parse(response);
  const week = raw.scoringPeriodId;
  const periods = raw.settings.scheduleSettings?.matchupPeriods;
  const period = Number(
    Object.entries(periods ?? {}).find(([, weeks]) =>
      weeks.includes(week),
    )?.[0] ??
      raw.status?.currentMatchupPeriod ??
      week,
  );
  const periodWeeks = periods?.[String(period)];
  const teams: FantasyTeam[] = raw.teams.map((team) => {
    const record = team.record?.overall;
    const name =
      team.name ||
      [team.location, team.nickname].filter(Boolean).join(" ") ||
      `Team ${team.id}`;
    const manager =
      (team.owners ?? [])
        .map((id) => {
          const member = raw.members?.find((m) => m.id === id);
          return (
            member?.displayName ||
            [member?.firstName, member?.lastName].filter(Boolean).join(" ")
          );
        })
        .filter(Boolean)
        .join(" & ") || "Manager unavailable";
    return {
      id: String(team.id),
      name,
      manager,
      abbreviation: team.abbrev || name.slice(0, 3).toUpperCase(),
      rank:
        (team.playoffSeed && team.playoffSeed > 0
          ? team.playoffSeed
          : team.rankCalculatedFinal) || 0,
      wins: record?.wins ?? 0,
      losses: record?.losses ?? 0,
      ties: record?.ties ?? 0,
      pointsFor: record?.pointsFor ?? 0,
      pointsAgainst: record?.pointsAgainst ?? 0,
      roster: (team.roster?.entries ?? []).map(
        ({ playerPoolEntry: { player } }) => ({
          id: String(player.id),
          name: player.fullName,
          position: positions[player.defaultPositionId ?? 0] ?? "Other",
          proTeamId: player.proTeamId ?? null,
        }),
      ),
    };
  });
  teams.sort((a, b) => {
    if (a.rank > 0 && b.rank > 0 && a.rank !== b.rank) return a.rank - b.rank;
    const winPct = (t: FantasyTeam) =>
      (t.wins + t.ties / 2) / (t.wins + t.losses + t.ties || 1);
    return (
      winPct(b) - winPct(a) ||
      b.pointsFor - a.pointsFor ||
      a.id.localeCompare(b.id)
    );
  });
  teams.forEach((team, index) => {
    team.rank = index + 1;
  });
  const teamIds = new Set(teams.map((team) => team.id));
  return {
    id: String(raw.id),
    name: raw.settings.name,
    season: raw.seasonId,
    currentWeek: week,
    teams,
    matchups: (raw.schedule ?? [])
      .filter(
        (m) =>
          m.matchupPeriodId === period &&
          m.home &&
          teamIds.has(String(m.home.teamId)),
      )
      .map((m) => {
        const weeklyScore = (side: typeof m.home) => {
          if (!side) return null;
          const points = side.pointsByScoringPeriod?.[String(week)];
          // Never present a multi-week playoff total as a single week's score.
          return (
            points ??
            (periodWeeks?.length === 1 || (!periodWeeks && period === week)
              ? (side.totalPoints ?? null)
              : null)
          );
        };
        return {
          id: String(m.id),
          week,
          homeTeamId: String(m.home!.teamId),
          awayTeamId:
            m.away && teamIds.has(String(m.away.teamId))
              ? String(m.away.teamId)
              : null,
          homeScore: weeklyScore(m.home),
          awayScore: weeklyScore(m.away),
        };
      }),
  };
}
