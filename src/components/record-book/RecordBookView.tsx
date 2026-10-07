export type RecordLeader = {
  rank: number;
  team: string;
  owner?: string;
  value: number;
  season: number;
  week?: number;
};

export type RecordBookData = {
  leagueName: string;
  seasons: number[];
  selectedSeason: number | null;
  totals: {
    seasons: number;
    matchups: number;
    points: number;
  };
  headline: {
    eyebrow: string;
    title: string;
    summary: string;
  };
  records: Array<{
    id: string;
    label: string;
    value: number;
    unit?: string;
    team: string;
    opponent?: string;
    season: number;
    week?: number;
    note?: string;
  }>;
  scoringLeaders: RecordLeader[];
  blowoutLeaders: RecordLeader[];
  franchiseLeaders: Array<{
    rank: number;
    team: string;
    owner?: string;
    wins: number;
    winPct: number;
    championships?: number;
  }>;
  recentSeasons: Array<{
    season: number;
    champion?: string;
    runnerUp?: string;
    topScorer?: string;
    points?: number;
  }>;
};

function formatRecordValue(value: number, unit?: string) {
  const formatted = value.toLocaleString("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: Number.isInteger(value) ? 0 : 1,
  });
  return unit ? `${formatted} ${unit}` : formatted;
}

function Leaderboard({
  title,
  eyebrow,
  leaders,
  valueLabel,
}: {
  title: string;
  eyebrow: string;
  leaders: RecordLeader[];
  valueLabel: string;
}) {
  return (
    <section className="record-panel leaderboard-panel">
      <div className="record-section-heading">
        <div>
          <p className="editorial-kicker">{eyebrow}</p>
          <h2>{title}</h2>
        </div>
        <span className="record-count">Top {leaders.length}</span>
      </div>
      <div className="leader-list">
        {leaders.map((leader) => (
          <article className="leader-row" key={`${leader.rank}-${leader.team}-${leader.season}`}>
            <span className="leader-rank">{leader.rank}</span>
            <span className="team-initials" aria-hidden="true">
              {leader.team
                .split(/\s+/)
                .map((part) => part[0])
                .join("")
                .slice(0, 2)}
            </span>
            <div className="leader-team">
              <strong>{leader.team}</strong>
              <span>
                {leader.owner ? `${leader.owner} · ` : ""}
                {leader.season}
                {leader.week ? `, Week ${leader.week}` : ""}
              </span>
            </div>
            <div className="leader-value">
              <strong>{leader.value.toFixed(2)}</strong>
              <span>{valueLabel}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function RecordBookView({ data }: { data: RecordBookData }) {
  const dateRange = data.seasons.length
    ? data.selectedSeason?.toString() ??
      `${Math.min(...data.seasons)}–${Math.max(...data.seasons)}`
    : "All seasons";

  return (
    <main id="main" className="shell record-book-page">
      <header className="record-book-header">
        <div>
          <p className="page-kicker">ICSJ FFL ARCHIVE · {dateRange}</p>
          <h1>Record Book</h1>
          <p className="page-intro">
            Every Sunday leaves a mark. Explore the performances, rivalries,
            and franchises that built {data.leagueName}.
          </p>
        </div>
        <form className="season-filter" action="/history" method="get">
          <label htmlFor="season">Season</label>
          <select
            id="season"
            name="season"
            defaultValue={data.selectedSeason?.toString() ?? "all"}
          >
            <option value="all">All-time</option>
            {[...data.seasons]
              .sort((a, b) => b - a)
              .map((season) => (
                <option value={season} key={season}>
                  {season}
                </option>
              ))}
          </select>
          <button type="submit">View</button>
        </form>
      </header>

      <section className="history-ledger" aria-label="Archive totals">
        <div>
          <span>Seasons archived</span>
          <strong>{data.totals.seasons}</strong>
        </div>
        <div>
          <span>Matchups played</span>
          <strong>{data.totals.matchups.toLocaleString("en-US")}</strong>
        </div>
        <div>
          <span>Points scored</span>
          <strong>{Math.round(data.totals.points).toLocaleString("en-US")}</strong>
        </div>
        <div>
          <span>Archive range</span>
          <strong>{dateRange}</strong>
        </div>
      </section>

      <section className="record-chronicle">
        <div>
          <p className="editorial-kicker">{data.headline.eyebrow}</p>
          <h2>{data.headline.title}</h2>
          <p>{data.headline.summary}</p>
        </div>
        {data.blowoutLeaders[0] && (
          <div className="chronicle-score">
            <span>All-time margin</span>
            <strong>{data.blowoutLeaders[0].value.toFixed(1)}</strong>
            <p>
              {data.blowoutLeaders[0].team} · {data.blowoutLeaders[0].season}
            </p>
          </div>
        )}
      </section>

      <section className="record-card-grid" aria-label="All-time records">
        {data.records.map((record, index) => (
          <article className={`record-card record-card-${(index % 4) + 1}`} key={record.id}>
            <span className="record-number">{String(index + 1).padStart(2, "0")}</span>
            <p>{record.label}</p>
            <strong>{formatRecordValue(record.value, record.unit)}</strong>
            <h2>{record.team}</h2>
            <span>
              {record.opponent ? `vs ${record.opponent} · ` : ""}
              {record.season}
              {record.week ? `, Week ${record.week}` : ""}
            </span>
            {record.note && <small>{record.note}</small>}
          </article>
        ))}
      </section>

      <div className="record-leaderboards">
        <Leaderboard
          eyebrow="THE HIGHEST PEAKS"
          title="Single-game scoring"
          leaders={data.scoringLeaders}
          valueLabel="points"
        />
        <Leaderboard
          eyebrow="NO MERCY"
          title="Biggest blowouts"
          leaders={data.blowoutLeaders}
          valueLabel="point margin"
        />
      </div>

      <section className="record-panel franchise-panel">
        <div className="record-section-heading">
          <div>
            <p className="editorial-kicker">BUILT OVER SUNDAYS</p>
            <h2>Franchise table</h2>
          </div>
          <span className="record-count">Regular season</span>
        </div>
        <div className="franchise-table-wrap">
          <table className="franchise-table">
            <caption className="sr-only">
              All-time franchise wins and winning percentage
            </caption>
            <thead>
              <tr>
                <th scope="col">Rank</th>
                <th scope="col">Franchise</th>
                <th scope="col" className="numeric">Wins</th>
                <th scope="col" className="numeric">Win %</th>
                <th scope="col" className="numeric">Titles</th>
              </tr>
            </thead>
            <tbody>
              {data.franchiseLeaders.map((team) => (
                <tr key={`${team.rank}-${team.team}`}>
                  <td>{team.rank}</td>
                  <th scope="row">
                    <strong>{team.team}</strong>
                    {team.owner && <span>{team.owner}</span>}
                  </th>
                  <td className="numeric">{team.wins}</td>
                  <td className="numeric">{(team.winPct * 100).toFixed(1)}%</td>
                  <td className="numeric">{team.championships ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="season-capsules">
        <div className="record-section-heading">
          <div>
            <p className="editorial-kicker">RECENT HISTORY</p>
            <h2>Season by season</h2>
          </div>
          <span className="coming-soon-label">Chronicle coming soon</span>
        </div>
        <div className="season-capsule-grid">
          {data.recentSeasons.map((season) => (
            <article className="season-capsule" key={season.season}>
              <span>{season.season}</span>
              <p>Champion</p>
              <h3>{season.champion ?? "Season in progress"}</h3>
              {season.runnerUp && <small>over {season.runnerUp}</small>}
              {season.topScorer && (
                <div>
                  <span>Top scorer</span>
                  <strong>{season.topScorer}</strong>
                  {season.points !== undefined && <em>{season.points.toFixed(1)} pts</em>}
                </div>
              )}
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
