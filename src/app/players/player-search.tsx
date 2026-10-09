"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import styles from "./players.module.css";

type PlayerSuggestion = {
  espn_player_id: number;
  display_name: string;
  default_position_id: number | null;
  first_seen_season: number;
  last_seen_season: number;
};

type Props = {
  initialQuery: string;
  initialPlayers: PlayerSuggestion[];
  latestSeason: number | null;
};

function presence(player: PlayerSuggestion, latestSeason: number | null) {
  const years = `${player.first_seen_season}${player.first_seen_season === player.last_seen_season ? "" : `–${player.last_seen_season}`}`;
  return latestSeason !== null && player.last_seen_season < latestSeason
    ? `Former league player · played ${years}`
    : `Played ${years}`;
}

export default function PlayerSearch({ initialQuery, initialPlayers, latestSeason }: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [players, setPlayers] = useState(initialPlayers);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isOpen, setIsOpen] = useState(initialPlayers.length > 0);
  const [loadFailed, setLoadFailed] = useState(false);
  const listId = useId();
  const router = useRouter();

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/players/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Player search failed");
        const data = await response.json() as { players: PlayerSuggestion[] };
        setPlayers(data.players);
        setIsOpen(true);
      } catch (error) {
        if ((error as DOMException).name !== "AbortError") {
          setLoadFailed(true);
          setIsOpen(true);
        }
      }
    }, 180);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  function onChange(value: string) {
    setQuery(value);
    setPlayers([]);
    setActiveIndex(-1);
    setIsOpen(false);
    setLoadFailed(false);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((index) => Math.min(index + 1, players.length - 1));
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    }
    if (event.key === "Escape") {
      setActiveIndex(-1);
      setIsOpen(false);
    }
    if (event.key === "Enter" && isOpen && activeIndex >= 0 && players[activeIndex]) {
      event.preventDefault();
      router.push(`/players/${players[activeIndex].espn_player_id}`);
    }
  }

  return (
    <form className={styles.search} action="/players" method="get">
      <label htmlFor="player-search">Find a player</label>
      <p className={styles.searchHint}>Search the full archive, including former league players.</p>
      <div>
        <input
          id="player-search"
          name="q"
          autoComplete="off"
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={isOpen}
          aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
          onChange={(event) => onChange(event.target.value)}
          onFocus={() => players.length && setIsOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Start with two letters"
          role="combobox"
          value={query}
        />
        <button type="submit">Search</button>
      </div>
      {isOpen && <ul id={listId} className={styles.suggestions} role="listbox" aria-label="Player suggestions">
        {players.map((player, index) => <li key={player.espn_player_id} id={`${listId}-${index}`} aria-selected={index === activeIndex} role="option">
          <Link href={`/players/${player.espn_player_id}`} onClick={() => setIsOpen(false)}>
            <strong>{player.display_name}</strong><span>{presence(player, latestSeason)}</span>
          </Link>
        </li>)}
      </ul>}
      {query.trim().length >= 2 && isOpen && !players.length && <p className={styles.searchEmpty}>{loadFailed ? "Player suggestions are unavailable right now." : "No archived player matches that search."}</p>}
    </form>
  );
}
