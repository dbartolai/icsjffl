import type { Metadata } from "next";
import Link from "next/link";
import { formatPosition, getTeamRoster, parseSeason, parseWeek } from "@/lib/player-history";
import styles from "../../players.module.css";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Recorded team roster" };
}

export default async function TeamRosterPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<{ season?: string | string[]; week?: string | string[] }>;
}) {
  const { teamId } = await params;
  const filters = await searchParams;
  const season = parseSeason(typeof filters.season === "string" ? filters.season : undefined);
  const week = parseWeek(typeof filters.week === "string" ? filters.week : undefined);
  const roster = await getTeamRoster({ teamId, season, week });
  if (!roster) return <main id="main" className="shell"><section className={styles.empty}>The roster archive is unavailable.</section></main>;
  if (!roster.team) return <main id="main" className="shell"><section className={styles.empty}><h1>Team not found</h1><p>This team is not in the public roster archive.</p><Link href="/players">Back to players</Link></section></main>;

  return (
    <main id="main" className={`shell ${styles.page}`}>
      <Link className={styles.back} href="/players">← Players</Link>
      <header className={styles.header}>
        <p className="editorial-kicker">TEAM ROSTER</p>
        <h1>{roster.team.teamName}</h1>
        <p>{roster.requestedPeriodMissing ? (week ? `No roster was recorded for ${roster.team.season}, Week ${week}.` : `No direct weekly roster was recorded in ${roster.team.season}.`) : `Roster recorded for ${roster.team.season}, Week ${roster.team.week}.`}</p>
      </header>
      <div className={styles.rosterFilters}>
        <form className={styles.filters} method="get"><label>Season <select name="season" defaultValue={roster.team.season.toString()}>{roster.availableSeasons.map((value) => <option key={value} value={value}>{value}</option>)}</select></label><button type="submit">Change season</button></form>
        {roster.availableWeeks.length ? <form className={styles.filters} method="get"><input type="hidden" name="season" value={roster.team.season} /><label>Week <select name="week" defaultValue={roster.requestedPeriodMissing ? "" : roster.team.week.toString()}>{roster.requestedPeriodMissing && <option value="">Choose a recorded week</option>}{roster.availableWeeks.map((value) => <option key={value} value={value}>Week {value}</option>)}</select></label><button type="submit">View week</button></form> : <p className={styles.noWeek}>No direct weekly roster is available for {roster.team.season}.</p>}
      </div>
      <section className={styles.weekly} aria-labelledby="roster-players-heading">
        <div className={styles.sectionHeading}><div><p className="editorial-kicker">PLAYERS</p><h2 id="roster-players-heading">Recorded players</h2></div><p>{roster.players.length} players</p></div>
        {roster.players.length ? <div className={styles.tableWrap}><table><thead><tr><th>Player</th><th>Position</th><th className="numeric">Actual</th><th className="numeric">Projection</th></tr></thead><tbody>{roster.players.map((player) => <tr key={player.espn_player_id}>
          <th scope="row"><Link href={`/players/${player.espn_player_id}?season=${roster.team?.season}&week=${roster.team?.week}`}>{player.display_name}</Link></th><td>{formatPosition(player.default_position_id)}</td><td className="numeric">{player.actual_score_evidence_status === "confirmed" && player.actual_points !== null ? player.actual_points.toFixed(2) : "Not recorded"}</td><td className="numeric">{player.projection_evidence_status === "confirmed" && player.projected_points !== null ? player.projected_points.toFixed(2) : "Not recorded"}</td>
        </tr>)}</tbody></table></div> : <section className={styles.empty}>{roster.availableWeeks.length ? "Choose one of the recorded weeks above to view this roster." : "No direct weekly roster is available for this season."}</section>}
      </section>
    </main>
  );
}
