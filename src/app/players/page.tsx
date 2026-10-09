import type { Metadata } from "next";
import Link from "next/link";
import { getRosterTeamChoices, searchPlayers } from "@/lib/player-history";
import PlayerSearch from "./player-search";
import styles from "./players.module.css";

export const metadata: Metadata = {
  title: "Players",
  description: "Search the ICSJ FFL player archive and browse recorded team rosters.",
};

export const dynamic = "force-dynamic";

export default async function PlayersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim().slice(0, 80) : "";
  const [teams, players] = await Promise.all([
    getRosterTeamChoices(),
    query.length >= 2 ? searchPlayers(query) : Promise.resolve([]),
  ]);

  if (!teams) {
    return <main id="main" className="shell"><section className={styles.empty}>Player history needs the public archive connection.</section></main>;
  }

  const latestSeason = teams[0]?.season ?? null;
  return (
    <main id="main" className={`shell ${styles.page}`}>
      <header className={styles.header}>
        <p className="editorial-kicker">PLAYER ARCHIVE</p>
        <h1>Players</h1>
        <p>Search every archived player, or open a roster from the most recent recorded week.</p>
      </header>
      <PlayerSearch initialQuery={query} initialPlayers={players} latestSeason={latestSeason} />
      <section className={styles.teamSection} aria-labelledby="team-rosters-heading">
        <div className={styles.sectionHeading}>
          <div><p className="editorial-kicker">TEAM ROSTERS</p><h2 id="team-rosters-heading">Recorded team rosters</h2></div>
          {teams[0] && <p>Most recent record: {teams[0].season}, Week {teams[0].week}</p>}
        </div>
        {teams.length ? <ul className={styles.teamList}>
          {teams.map((team) => <li key={team.teamId}>
            <Link href={`/players/teams/${encodeURIComponent(team.teamId)}?season=${team.season}&week=${team.week}`}>
              <strong>{team.teamName}</strong><span>Roster recorded for Week {team.week}</span>
            </Link>
          </li>)}
        </ul> : <section className={styles.empty}>No recorded team roster is available yet.</section>}
      </section>
    </main>
  );
}
