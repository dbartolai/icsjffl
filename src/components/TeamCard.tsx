import type { FantasyTeam } from "@/types/fantasy";

export function TeamBadge({ team }: { team: FantasyTeam }) {
  return (
    <span
      aria-hidden="true"
      className={`team-badge tone-${Number(team.id) % 4}`}
    >
      {team.abbreviation.slice(0, 3)}
    </span>
  );
}

export function TeamCard({ team }: { team: FantasyTeam }) {
  return (
    <article className="panel team-card">
      <div className="flex items-start justify-between gap-3">
        <TeamBadge team={team} />
        <span className="muted text-xs">#{team.rank}</span>
      </div>
      <h3 className="mt-5 font-semibold">{team.name}</h3>
      <p className="muted mt-1 text-xs">{team.manager}</p>
      <div className="team-card-stats">
        <div>
          <span className="stat-label">RECORD</span>
          <strong>
            {team.wins}–{team.losses}–{team.ties}
          </strong>
        </div>
        <div className="text-right">
          <span className="stat-label">POINTS FOR</span>
          <strong>{team.pointsFor.toFixed(2)}</strong>
        </div>
      </div>
    </article>
  );
}
