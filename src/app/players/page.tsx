import type { Metadata } from "next";
import { getLatestPlayerSeason, searchPlayers } from "@/lib/player-history";
import PlayerSearch from "./player-search";
import styles from "./players.module.css";

export const metadata: Metadata = {
  title: "Players",
  description: "Search the ICSJ FFL player archive.",
};

export const dynamic = "force-dynamic";

export default async function PlayersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim().slice(0, 80) : "";
  const [latestSeason, players] = await Promise.all([
    getLatestPlayerSeason(),
    query.length >= 2 ? searchPlayers(query) : Promise.resolve([]),
  ]);
  return (
    <main id="main" className={`shell ${styles.page}`}>
      <header className={styles.header}>
        <p className="editorial-kicker">PLAYER ARCHIVE</p>
        <h1>Players</h1>
        <p>Search every player recorded in the league archive.</p>
      </header>
      <PlayerSearch initialQuery={query} initialPlayers={players} latestSeason={latestSeason} />
    </main>
  );
}
