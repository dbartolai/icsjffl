import type { LeagueData } from "@/types/fantasy";

export function LeagueHeader({ league, source }: LeagueData) {
  return (
    <header className="league-header">
      <div>
        <div className="eyebrow">
          <span className="accent-line" /> FANTASY FOOTBALL / {league.season}{" "}
          SEASON
        </div>
        <h1>{league.name}</h1>
        <p className="muted">Your league. Every matchup. All in one place.</p>
      </div>
      <div className="header-meta">
        <span className="source-pill">
          <span className={source === "espn" ? "status-dot" : "demo-dot"} />
          {source === "espn" ? "ESPN connected" : "Mock data"}
        </span>
        <span className="muted text-sm">
          {league.teams.length} teams <span className="mx-2 opacity-40">/</span>{" "}
          Week {league.currentWeek}
        </span>
      </div>
    </header>
  );
}
