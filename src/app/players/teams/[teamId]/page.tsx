import type { Metadata } from "next";
import Link from "next/link";
import { EspnError } from "@/lib/espn/client";
import { getLeagueData } from "@/lib/league";
import styles from "../../players.module.css";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Current team roster" };
}

export default async function TeamRosterPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  let data;
  try {
    data = await getLeagueData();
  } catch (error) {
    if (!(error instanceof EspnError)) throw error;
    return <main id="main" className="shell"><section className={styles.empty}><h1>Current roster unavailable</h1><p>{error.message}</p><form action={`/players/teams/${encodeURIComponent(teamId)}`} method="get"><button type="submit">Try again</button></form><Link href="/players">Back to players</Link></section></main>;
  }

  if (data.source === "mock") return <main id="main" className="shell"><section className={styles.empty}><h1>Current roster unavailable</h1><p>Current rosters are only available from the connected league.</p><Link href="/players">Back to players</Link></section></main>;

  const team = data.league.teams.find((candidate) => candidate.id === teamId);
  if (!team) return <main id="main" className="shell"><section className={styles.empty}><h1>Team not found</h1><p>This team is not available in the current league.</p><Link href="/players">Back to players</Link></section></main>;

  return <main id="main" className={`shell ${styles.page}`}>
    <Link className={styles.back} href="/players">← Players</Link>
    <header className={styles.header}><p className="editorial-kicker">CURRENT ROSTER</p><h1>{team.name}</h1><p>{data.league.season} · Week {data.league.currentWeek}</p></header>
    <section className={styles.weekly} aria-labelledby="roster-players-heading">
      <div className={styles.sectionHeading}><div><p className="editorial-kicker">PLAYERS</p><h2 id="roster-players-heading">Current players</h2></div><p>{team.roster.length} players</p></div>
      {team.roster.length ? <div className={styles.tableWrap}><table><thead><tr><th>Player</th><th>Position</th></tr></thead><tbody>{team.roster.map((player) => <tr key={player.id}><th scope="row"><Link href={`/players/${player.id}`}>{player.name}</Link></th><td>{player.position}</td></tr>)}</tbody></table></div> : <section className={styles.empty}>No current roster entries are available from ESPN.</section>}
    </section>
  </main>;
}
