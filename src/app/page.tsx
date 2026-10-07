import { LeagueHeader } from "@/components/LeagueHeader";
import { StandingsTable } from "@/components/StandingsTable";
import { MatchupCard } from "@/components/MatchupCard";
import { TeamCard } from "@/components/TeamCard";
import { getLeagueData } from "@/lib/league";
import { EspnError } from "@/lib/espn/client";

export const dynamic = "force-dynamic";

export default async function Home() {
  let data;
  try {
    data = await getLeagueData();
  } catch (error) {
    if (!(error instanceof EspnError)) throw error;
    return (
      <main id="main" className="shell py-16">
        <div role="alert" className="panel p-8">
          <div className="eyebrow">CONNECTION ISSUE</div>
          <h1 className="text-3xl mt-4">Unable to load your league</h1>
          <p className="muted mt-4">{error.message}</p>
          <form action="/" method="get">
            <button className="button mt-6" type="submit">
              Try again ↗
            </button>
          </form>
        </div>
      </main>
    );
  }
  const { league, source } = data;
  const leader = league.teams[0];
  const topScorer = league.teams.reduce<
    (typeof league.teams)[number] | undefined
  >(
    (best, team) => (!best || team.pointsFor > best.pointsFor ? team : best),
    undefined,
  );
  const totalPoints = league.teams.reduce(
    (sum, team) => sum + team.pointsFor,
    0,
  );
  return (
    <main id="main" className="shell">
      <LeagueHeader {...data} />
      {source === "mock" && (
        <aside className="demo-banner">
          <span className="demo-banner-label">DEMO LEAGUE</span>
          <p>
            You’re viewing fictional mock data. Add your ESPN league
            configuration in <code>.env.local</code> to connect your league.
          </p>
        </aside>
      )}
      <section className="overview-grid" aria-label="League overview">
        <div className="overview-stat">
          <span className="stat-label">CURRENT WEEK</span>
          <div className="overview-value">
            {String(league.currentWeek).padStart(2, "0")}
            <span className="stat-suffix"> / {league.season}</span>
          </div>
          <p className="muted text-xs">Football season</p>
        </div>
        <div className="overview-stat">
          <span className="stat-label">LEAGUE LEADER</span>
          <div className="overview-value">
            {leader ? `${leader.wins}–${leader.losses}–${leader.ties}` : "—"}
          </div>
          <p className="muted text-xs">{leader?.name ?? "No standings yet"}</p>
        </div>
        <div className="overview-stat">
          <span className="stat-label">TOP SCORER</span>
          <div className="overview-value">
            {topScorer?.pointsFor.toFixed(2) ?? "—"}
            <span className="stat-suffix"> pts</span>
          </div>
          <p className="muted text-xs">{topScorer?.name ?? "No scores yet"}</p>
        </div>
        <div className="overview-stat">
          <span className="stat-label">LEAGUE POINTS</span>
          <div className="overview-value">
            {totalPoints.toLocaleString("en-US", {
              maximumFractionDigits: 2,
              minimumFractionDigits: 2,
            })}
          </div>
          <p className="muted text-xs">Season points for · all teams</p>
        </div>
      </section>
      <div className="dashboard-grid">
        <section id="standings" className="min-w-0">
          <div className="section-heading">
            <div>
              <h2>League standings</h2>
              <p className="muted">The season so far.</p>
            </div>
            <span className="subtle-pill">{league.teams.length} teams</span>
          </div>
          <StandingsTable teams={league.teams} />
          <p className="muted mt-3 text-xs">
            PF: points for · PA: points against · DIFF: point differential
          </p>
        </section>
        <section id="matchups">
          <div className="section-heading">
            <div>
              <h2>Weekly matchups</h2>
              <p className="muted">Week {league.currentWeek} scoreboard.</p>
            </div>
            <span className="week-mark">
              W{String(league.currentWeek).padStart(2, "0")}
            </span>
          </div>
          <div className="grid gap-3">
            {league.matchups.length ? (
              league.matchups.map((matchup) => (
                <MatchupCard
                  key={matchup.id}
                  matchup={matchup}
                  teams={league.teams}
                />
              ))
            ) : (
              <div className="panel empty-state">
                No matchups scheduled for this week.
              </div>
            )}
          </div>
          <p className="muted mt-3 text-xs">
            Scores update when you reload. No live polling.
          </p>
        </section>
      </div>
      <section id="teams" className="teams-section">
        <div className="section-heading">
          <div>
            <h2>Around the league</h2>
            <p className="muted">Meet the competition.</p>
          </div>
          <span className="muted text-xs">{league.season} ROSTER OF TEAMS</span>
        </div>
        <div className="team-grid">
          {league.teams.map((team) => (
            <TeamCard key={team.id} team={team} />
          ))}
        </div>
        {!league.teams.length && (
          <p className="muted">
            Teams will appear when your league is available.
          </p>
        )}
      </section>
      <footer>
        <span>
          ICSJ FFL <span className="muted mx-2">/</span> {league.season}
        </span>
        <span>
          {source === "mock"
            ? "Demo mode · fictional league data"
            : "League data from ESPN · unofficial integration"}
        </span>
      </footer>
    </main>
  );
}
