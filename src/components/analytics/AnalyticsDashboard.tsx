import type {
  FranchiseAnalytics,
  LeagueAnalytics,
} from "@/lib/analytics/types";
import styles from "./AnalyticsDashboard.module.css";

function decimal(value: number, digits = 1) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function signed(value: number, suffix = "") {
  const sign = value > 0 ? "+" : "";
  return `${sign}${decimal(value)}${suffix}`;
}

function record(team: FranchiseAnalytics) {
  return `${team.wins}-${team.losses}${team.ties ? `-${team.ties}` : ""}`;
}

function allPlayRecord(team: FranchiseAnalytics) {
  return `${team.allPlayWins}-${team.allPlayLosses}${
    team.allPlayTies ? `-${team.allPlayTies}` : ""
  }`;
}

function MetricCard({
  label,
  team,
  value,
  detail,
  tone,
}: {
  label: string;
  team: FranchiseAnalytics | null;
  value: string;
  detail: string;
  tone: "blue" | "red" | "green" | "gold";
}) {
  return (
    <article className={`${styles.metricCard} ${styles[tone]}`}>
      <p>{label}</p>
      <strong>{team?.teamName ?? "Not enough games"}</strong>
      <span>{team ? value : "—"}</span>
      <small>{detail}</small>
    </article>
  );
}

export function AnalyticsDashboard({ data }: { data: LeagueAnalytics }) {
  const maxScore = Math.max(
    1,
    ...data.franchises.flatMap((team) => [
      team.pointsForPerGame,
      team.pointsAgainstPerGame,
    ]),
  );
  const mostFortunate = data.insights.mostFortunate;
  const toughestSchedule = data.insights.toughestSchedule;
  const mostConsistent = data.insights.mostConsistent;
  const mostVolatile = data.insights.mostVolatile;

  return (
    <main id="main" className={styles.page}>
      <header className={styles.hero}>
        <div>
          <p className={styles.kicker}>ICSJ FFL · LEAGUE LAB</p>
          <h1>Analytics</h1>
          <p className={styles.intro}>
            Weekly scores retold as expected wins, schedule fortune, scoring
            context, and team-by-team performance across {data.leagueName}.
          </p>
        </div>
        <form className={styles.filter} action="/analytics" method="get">
          <label htmlFor="analytics-season">Season</label>
          <div>
            <select
              id="analytics-season"
              name="season"
              defaultValue={data.selectedSeason?.toString() ?? "all"}
            >
              <option value="all">All-time</option>
              {data.availableSeasons.map((season) => (
                <option value={season} key={season}>
                  {season}
                </option>
              ))}
            </select>
            <button type="submit">Apply</button>
          </div>
        </form>
      </header>

      <section className={styles.ledger} aria-label="Analytics scope">
        <div>
          <span>View</span>
          <strong>{data.scopeLabel}</strong>
        </div>
        <div>
          <span>Regular seasons</span>
          <strong>{data.totals.seasons}</strong>
        </div>
        <div>
          <span>Matchups measured</span>
          <strong>{data.totals.matchups}</strong>
        </div>
        <div>
          <span>Avg team score</span>
          <strong>{decimal(data.totals.averageScore)}</strong>
        </div>
      </section>

      <section className={styles.insights} aria-labelledby="insights-title">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>WHAT THE RECORD MISSES</p>
            <h2 id="insights-title">Four ways to read the season</h2>
          </div>
          <p>All figures use regular-season matchups only.</p>
        </div>
        <div className={styles.metricGrid}>
          <MetricCard
            label="Most schedule fortune"
            team={mostFortunate}
            value={mostFortunate ? signed(mostFortunate.scheduleLuck, " wins") : ""}
            detail="Actual wins above weekly expected wins"
            tone="blue"
          />
          <MetricCard
            label="Toughest scoring slate"
            team={toughestSchedule}
            value={
              toughestSchedule
                ? `${decimal(toughestSchedule.pointsAgainstPerGame)} PA / game`
                : ""
            }
            detail="Highest opponent scoring average"
            tone="red"
          />
          <MetricCard
            label="Steadiest scorer"
            team={mostConsistent}
            value={
              mostConsistent
                ? `${decimal(mostConsistent.weeklyStandardDeviation)} σ`
                : ""
            }
            detail="Lowest weekly scoring deviation"
            tone="green"
          />
          <MetricCard
            label="Wildest swings"
            team={mostVolatile}
            value={
              mostVolatile
                ? `${decimal(mostVolatile.weeklyStandardDeviation)} σ`
                : ""
            }
            detail="Highest weekly scoring deviation"
            tone="gold"
          />
        </div>
      </section>

      <section className={styles.scoringSection} aria-labelledby="scoring-title">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>POINTS FOR · POINTS AGAINST</p>
            <h2 id="scoring-title">Scoring context</h2>
          </div>
          <p>
            Blue is points scored per game. Red is opponent points per game.
          </p>
        </div>
        <div className={styles.scoreChart}>
          {data.franchises.map((team) => (
            <article className={styles.scoreRow} key={team.teamId}>
              <div className={styles.teamLabel}>
                <strong>{team.teamName}</strong>
                <span>
                  {signed(team.pointsForVsAverage)} PF vs avg · {signed(team.pointsAgainstVsAverage)} PA vs avg
                </span>
              </div>
              <div className={styles.barGroup} aria-label={`${team.teamName} scoring averages`}>
                <div>
                  <b>{decimal(team.pointsForPerGame)}</b>
                  <span className={styles.barTrack}>
                    <span
                      className={styles.barFill}
                      style={{ width: `${(team.pointsForPerGame / maxScore) * 100}%` }}
                    />
                  </span>
                </div>
                <div>
                  <b>{decimal(team.pointsAgainstPerGame)}</b>
                  <span className={styles.barTrack}>
                    <span
                      className={styles.barFill}
                      style={{ width: `${(team.pointsAgainstPerGame / maxScore) * 100}%` }}
                    />
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.tableSection} aria-labelledby="table-title">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>EVERY TEAM, EVERY WEEK</p>
            <h2 id="table-title">All-play table</h2>
          </div>
          <p>Ranked by all-play percentage, then point differential.</p>
        </div>
        <div className={styles.tableWrap}>
          <table>
            <caption className={styles.srOnly}>
              Franchise results, all-play performance, expected wins, schedule
              luck, and scoring volatility
            </caption>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Franchise</th>
                <th scope="col">Record</th>
                <th scope="col">PF / G</th>
                <th scope="col">PA / G</th>
                <th scope="col">All-play</th>
                <th scope="col">All-play %</th>
                <th scope="col">xW</th>
                <th scope="col">Luck</th>
                <th scope="col">Volatility</th>
              </tr>
            </thead>
            <tbody>
              {data.franchises.map((team, index) => (
                <tr key={team.teamId}>
                  <td>{index + 1}</td>
                  <th scope="row">
                    <strong>{team.teamName}</strong>
                    <span>{team.managerName ?? `Franchise ID ${team.teamId}`}</span>
                  </th>
                  <td>{record(team)}</td>
                  <td>{decimal(team.pointsForPerGame)}</td>
                  <td>{decimal(team.pointsAgainstPerGame)}</td>
                  <td>{allPlayRecord(team)}</td>
                  <td>{decimal(team.allPlayPct * 100)}%</td>
                  <td>{decimal(team.expectedWins, 2)}</td>
                  <td
                    className={
                      team.scheduleLuck > 0
                        ? styles.positive
                        : team.scheduleLuck < 0
                          ? styles.negative
                          : undefined
                    }
                  >
                    {signed(team.scheduleLuck)}
                  </td>
                  <td>{decimal(team.weeklyStandardDeviation)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.notes} aria-labelledby="method-title">
        <div>
          <p className={styles.eyebrow}>READING THE NUMBERS</p>
          <h2 id="method-title">Metric guide</h2>
        </div>
        <dl>
          <div>
            <dt>All-play</dt>
            <dd>Your score compared with every other team in the same week.</dd>
          </div>
          <div>
            <dt>Expected wins (xW)</dt>
            <dd>
              Each week&apos;s all-play win share, scaled to one possible win.
            </dd>
          </div>
          <div>
            <dt>Schedule luck</dt>
            <dd>
              Actual win equivalents minus xW. Positive means the schedule
              helped; negative means it hurt.
            </dd>
          </div>
          <div>
            <dt>Volatility</dt>
            <dd>
              Population standard deviation of weekly scores. Lower is steadier.
            </dd>
          </div>
        </dl>
        <div className={styles.dataNotes}>
          {data.limitations.map((limitation) => (
            <p key={limitation}>{limitation}</p>
          ))}
        </div>
      </section>
    </main>
  );
}

export function AnalyticsEmptyState() {
  return (
    <main id="main" className={`${styles.page} ${styles.empty}`}>
      <p className={styles.kicker}>ICSJ FFL · LEAGUE LAB</p>
      <h1>Analytics</h1>
      <p>
        No archived league rows are available yet. Configure the existing
        Supabase history connection and import at least one season to populate
        this page.
      </p>
    </main>
  );
}
