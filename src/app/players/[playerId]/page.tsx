import type { Metadata } from "next";
import Link from "next/link";
import { getPlayerHistory, parsePlayerId, parseSeason, parseWeek } from "@/lib/player-history";
import styles from "../players.module.css";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ playerId: string }> }): Promise<Metadata> {
  const playerId = parsePlayerId((await params).playerId);
  return { title: playerId ? "Player history" : "Player not found" };
}

function points(value: number | null, evidence: string) {
  return evidence === "confirmed" && value !== null ? value.toFixed(2) : "Not recorded";
}

function teamName(teamNames: Map<string, string>, season: number, teamId: string) {
  return teamNames.get(`${season}:${teamId}`) ?? "Unknown team";
}

export default async function PlayerPage({
  params,
  searchParams,
}: {
  params: Promise<{ playerId: string }>;
  searchParams: Promise<{ season?: string | string[]; week?: string | string[] }>;
}) {
  const playerId = parsePlayerId((await params).playerId);
  const filters = await searchParams;
  const season = parseSeason(typeof filters.season === "string" ? filters.season : undefined);
  const week = parseWeek(typeof filters.week === "string" ? filters.week : undefined);
  const history = playerId ? await getPlayerHistory({ playerId, season, week }) : null;
  if (!history) return <main id="main" className="shell"><section className={styles.empty}><h1>Player not found</h1><p>This player is not in the public archive, or the archive is unavailable.</p><Link href="/players">Back to player search</Link></section></main>;

  const seasons = [...new Set([...history.drafts.map((row) => row.season), ...history.weeks.map((row) => row.season), ...history.coverage.map((row) => row.season)])].sort((a, b) => b - a);
  return (
    <main id="main" className={`shell ${styles.page}`}>
      <Link className={styles.back} href="/players">← Player search</Link>
      <header className={styles.header}>
        <p className="editorial-kicker">PLAYER ARCHIVE</p>
        <h1>{history.player.display_name}</h1>
        <p>Observed in ICSJ FFL from {history.player.first_seen_season} to {history.player.last_seen_season}. Position IDs are supplied by ESPN and not translated into historical eligibility.</p>
      </header>
      <form className={styles.filters} method="get">
        <label>Season <select name="season" defaultValue={season?.toString() ?? ""}><option value="">All seasons</option>{seasons.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label>Week <select name="week" defaultValue={week?.toString() ?? ""}><option value="">All weeks</option>{Array.from({ length: 18 }, (_, index) => index + 1).map((value) => <option key={value} value={value}>Week {value}</option>)}</select></label>
        <button type="submit">Apply</button>
      </form>
      <section className={styles.detailGrid}>
        <div className={styles.detailPanel}><p className="editorial-kicker">DRAFT HISTORY</p>{history.drafts.length ? <ul>{history.drafts.map((draft) => <li key={`${draft.season}-${draft.overall_pick}`}><strong>{draft.season}</strong><span>{teamName(history.teamNames, draft.season, draft.team_id)}</span><small>Round {draft.round}, pick {draft.round_pick}, overall {draft.overall_pick}</small></li>)}</ul> : <p>No draft record is available for this filter.</p>}</div>
        <div className={styles.detailPanel}><p className="editorial-kicker">COVERAGE NOTES</p>{history.coverage.length ? <ul>{history.coverage.map((coverage) => <li key={`${coverage.season}-${coverage.scoring_period_id}`}><strong>{coverage.season}{coverage.scoring_period_id ? ` · Week ${coverage.scoring_period_id}` : " · Season"}</strong><span>Roster {coverage.roster_evidence_status}; lineup {coverage.lineup_evidence_status}; actual {coverage.actual_score_evidence_status}; projection {coverage.projection_evidence_status}</span><small>{coverage.reason}</small></li>)}</ul> : <p>No coverage note is available for this filter.</p>}</div>
      </section>
      <section className={styles.weekly}><div className={styles.weeklyHeading}><p className="editorial-kicker">WEEKLY OBSERVATIONS</p><p>Actual and projection are separate source fields. A recorded lineup slot is shown as supplied; it is not reclassified as starter or bench.</p></div>
        {history.weeks.length ? <div className={styles.tableWrap}><table><thead><tr><th>Season</th><th>Week</th><th>Team</th><th>Lineup</th><th className="numeric">Actual</th><th className="numeric">Projection</th></tr></thead><tbody>{history.weeks.map((entry) => <tr key={`${entry.season}-${entry.scoring_period_id}`}><td>{entry.season}</td><td>{entry.scoring_period_id}</td><th scope="row">{teamName(history.teamNames, entry.season, entry.team_id)}</th><td>{entry.lineup_evidence_status === "confirmed" && entry.lineup_slot_id !== null ? `Recorded slot ${entry.lineup_slot_id}` : "Not recorded"}</td><td className="numeric">{points(entry.actual_points, entry.actual_score_evidence_status)}</td><td className="numeric">{points(entry.projected_points, entry.projection_evidence_status)}</td></tr>)}</tbody></table></div> : <div className={styles.empty}>No direct weekly player observation matches this filter. Weekly entries are available only from 2018 onward.</div>}
      </section>
    </main>
  );
}
