import Link from "next/link";
import { StandingsTable } from "@/components/StandingsTable";
import { MatchupCard } from "@/components/MatchupCard";
import { getLeagueData } from "@/lib/league";
import { EspnError } from "@/lib/espn/client";
import { currentRosterHref } from "@/lib/current-roster";
import { getRecordBookData } from "@/lib/record-book";

export const dynamic = "force-dynamic";
const SHOW_EDITORIAL_HIGHLIGHTS: boolean = false;

export default async function Home() {
  let data;
  let seasonRecords = null;
  try {
    [data, seasonRecords] = await Promise.all([
      getLeagueData(),
      SHOW_EDITORIAL_HIGHLIGHTS
        ? getRecordBookData(2026).catch(() => null)
        : Promise.resolve(null),
    ]);
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
      {SHOW_EDITORIAL_HIGHLIGHTS && seasonRecords ? (
        <section className="record-report home-report">
          <div>
            <p className="editorial-kicker">THE 2026 LEAGUE REPORT</p>
            <h1>{seasonRecords.headline.title}</h1>
            <p>{seasonRecords.headline.summary}</p>
            <Link className="button report-link" href="/history">
              Explore the record book
            </Link>
          </div>
          <div className="report-score">
            <span>Season&apos;s largest margin</span>
            <strong>
              {seasonRecords.blowoutLeaders[0]?.value.toFixed(1) ?? "—"}
            </strong>
            <p>
              {seasonRecords.blowoutLeaders[0]?.team ?? league.name} · Week{" "}
              {seasonRecords.blowoutLeaders[0]?.week ?? league.currentWeek}
            </p>
            <small>ESPN connected · Week {league.currentWeek}</small>
          </div>
        </section>
      ) : (
        <header className="league-header">
          <div>
            <p className="eyebrow">
              <span className="accent-line" /> FANTASY FOOTBALL / {league.season}
            </p>
            <h1>{league.name}</h1>
            <p className="muted">
              Live standings, weekly matchups, and season totals.
            </p>
          </div>
        </header>
      )}
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
          <div className="overview-value overview-team-name">
            {leader && source === "espn" ? <Link href={currentRosterHref(leader.id)} title="View current roster">{leader.name}</Link> : leader?.name ?? "No standings yet"}
          </div>
          <p className="muted text-xs">
            {leader ? `${leader.wins}–${leader.losses}–${leader.ties}` : "—"}
          </p>
        </div>
        <div className="overview-stat">
          <span className="stat-label">TOP SCORER</span>
          <div className="overview-value overview-team-name">
            {topScorer && source === "espn" ? <Link href={currentRosterHref(topScorer.id)} title="View current roster">{topScorer.name}</Link> : topScorer?.name ?? "No scores yet"}
          </div>
          <p className="muted text-xs">
            {topScorer ? `${topScorer.pointsFor.toFixed(2)} pts` : "—"}
          </p>
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
          <StandingsTable teams={league.teams} rosterLinks={source === "espn"} />
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
                  rosterLinks={source === "espn"}
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
