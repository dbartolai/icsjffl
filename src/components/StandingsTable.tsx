import Link from "next/link";
import { currentRosterHref } from "@/lib/current-roster";
import type { FantasyTeam } from "@/types/fantasy";
import { TeamBadge } from "./TeamCard";

export function StandingsTable({ teams, rosterLinks = false }: { teams: FantasyTeam[]; rosterLinks?: boolean }) {
  if (!teams.length)
    return <div className="panel empty-state">No teams are available yet.</div>;
  return (
    <div className="panel overflow-x-auto">
      <table>
        <caption className="sr-only">
          League standings, records, points for, and points against
        </caption>
        <thead>
          <tr>
            <th scope="col">RANK</th>
            <th scope="col">TEAM</th>
            <th scope="col" className="numeric">
              W–L–T
            </th>
            <th scope="col" className="numeric">
              PF
            </th>
            <th scope="col" className="numeric">
              PA
            </th>
            <th scope="col" className="numeric">
              DIFF
            </th>
          </tr>
        </thead>
        <tbody>
          {teams.map((team) => {
            const difference = team.pointsFor - team.pointsAgainst;
            const teamIdentity = <div className="flex items-center gap-3">
              <TeamBadge team={team} />
              <div>
                <div className="font-medium">{team.name}</div>
                <div className="muted mt-1 text-xs font-normal">{team.manager}</div>
              </div>
            </div>;
            return (
              <tr key={team.id}>
                <td>
                  <span className={team.rank === 1 ? "rank-first" : "muted"}>
                    {String(team.rank).padStart(2, "0")}
                  </span>
                </td>
                <th scope="row">
                  {rosterLinks ? <Link href={currentRosterHref(team.id)} title="View current roster" className="block">{teamIdentity}</Link> : teamIdentity}
                </th>
                <td className="numeric whitespace-nowrap">
                  {team.wins}–{team.losses}–{team.ties}
                </td>
                <td className="numeric">{team.pointsFor.toFixed(2)}</td>
                <td className="numeric muted">
                  {team.pointsAgainst.toFixed(2)}
                </td>
                <td
                  className={`numeric ${
                    difference > 0
                      ? "positive"
                      : difference < 0
                        ? "negative"
                        : "muted"
                  }`}
                >
                  {difference > 0 ? "+" : ""}
                  {difference.toFixed(2)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
