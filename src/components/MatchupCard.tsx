import Link from "next/link";
import { currentRosterHref } from "@/lib/current-roster";
import type { FantasyMatchup, FantasyTeam } from "@/types/fantasy";
import { TeamBadge } from "./TeamCard";

export function MatchupCard({
  matchup,
  teams,
  rosterLinks = false,
}: {
  matchup: FantasyMatchup;
  teams: FantasyTeam[];
  rosterLinks?: boolean;
}) {
  const home = teams.find((team) => team.id === matchup.homeTeamId);
  const away = teams.find((team) => team.id === matchup.awayTeamId);
  if (!home) return null;
  return (
    <article className="panel matchup-card">
      <div className="flex items-center justify-between mb-5">
        <span className="stat-label">WEEK {matchup.week}</span>
        <span className="muted text-xs">
          {away ? "Head-to-head" : "Bye week"}
        </span>
      </div>
      {[
        { team: home, score: matchup.homeScore },
        { team: away, score: matchup.awayScore },
      ].map(({ team, score }, index) => (
        <div key={index} className="matchup-side">
          {team ? (
            <>
              <TeamBadge team={team} />
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-medium">{rosterLinks ? <Link href={currentRosterHref(team.id)} title="View current roster">{team.name}</Link> : team.name}</h3>
                <p className="muted mt-1 text-xs">
                  {team.wins}–{team.losses}–{team.ties}
                </p>
              </div>
              <span className="matchup-score">{score?.toFixed(2) ?? "—"}</span>
            </>
          ) : (
            <p className="muted text-sm py-2">No opponent scheduled</p>
          )}
        </div>
      ))}
    </article>
  );
}
