import type { Metadata } from "next";
import Link from "next/link";
import { formatPosition, listPlayers } from "@/lib/player-history";
import styles from "./players.module.css";

export const metadata: Metadata = {
  title: "Player history",
  description: "Read-only ICSJ FFL player draft and weekly history.",
};

export const dynamic = "force-dynamic";

export default async function PlayersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; page?: string | string[] }>;
}) {
  const params = await searchParams;
  const result = await listPlayers({
    query: typeof params.q === "string" ? params.q : undefined,
    page: typeof params.page === "string" ? params.page : undefined,
  });

  if (!result) {
    return <main id="main" className="shell"><section className={styles.empty}>Player history needs the public archive connection.</section></main>;
  }

  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
  return (
    <main id="main" className={`shell ${styles.page}`}>
      <header className={styles.header}>
        <p className="editorial-kicker">PLAYER ARCHIVE</p>
        <h1>Player history</h1>
        <p>Draft records begin in 2017. Direct weekly roster observations begin in 2018.</p>
      </header>
      <form className={styles.search} action="/players" method="get">
        <label htmlFor="player-search">Find a player</label>
        <div>
          <input id="player-search" name="q" defaultValue={result.query} placeholder="Search by name" />
          <button type="submit">Search</button>
        </div>
      </form>
      <p className={styles.count}>{result.total.toLocaleString()} players in the archive</p>
      {result.players.length ? (
        <section className={styles.tableWrap} aria-label="Player results">
          <table>
            <thead><tr><th>Player</th><th>Position</th><th>Observed</th><th /></tr></thead>
            <tbody>{result.players.map((player) => (
              <tr key={player.espn_player_id}>
                <th scope="row"><Link href={`/players/${player.espn_player_id}`}>{player.display_name}</Link></th>
                <td>{formatPosition(player.default_position_id)}</td>
                <td>{player.first_seen_season}–{player.last_seen_season}</td>
                <td><Link href={`/players/${player.espn_player_id}`}>View history</Link></td>
              </tr>
            ))}</tbody>
          </table>
        </section>
      ) : <section className={styles.empty}>No players match that search.</section>}
      <nav className={styles.pagination} aria-label="Player result pages">
        {result.page > 1 ? <Link href={`/players?q=${encodeURIComponent(result.query)}&page=${result.page - 1}`}>Previous</Link> : <span>Previous</span>}
        <span>Page {result.page} of {totalPages}</span>
        {result.page < totalPages ? <Link href={`/players?q=${encodeURIComponent(result.query)}&page=${result.page + 1}`}>Next</Link> : <span>Next</span>}
      </nav>
    </main>
  );
}
