import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchCurrentPlayerImport, fetchHistoricalPlayerImport } from "./fetch";
import { persistCurrentPlayerImport } from "./store";
import type { CurrentPlayerImport, PlayerImportCounts } from "./types";

export async function importCurrentPlayerSeason(options: {
  season: number;
  supabase?: SupabaseClient | null;
  fetcher?: typeof fetch;
}): Promise<{ data: CurrentPlayerImport; counts: PlayerImportCounts | null }> {
  const data = await fetchCurrentPlayerImport({
    season: options.season,
    fetcher: options.fetcher,
  });
  return {
    data,
    counts: options.supabase
      ? await persistCurrentPlayerImport(options.supabase, data)
      : null,
  };
}

export async function importHistoricalPlayerSeason(options: {
  season: number;
  firstScoringPeriod?: number;
  lastScoringPeriod?: number;
  supabase?: SupabaseClient | null;
  fetcher?: typeof fetch;
}) {
  const data = await fetchHistoricalPlayerImport({
    season: options.season,
    firstScoringPeriod: options.firstScoringPeriod,
    lastScoringPeriod: options.lastScoringPeriod,
    fetcher: options.fetcher,
  });
  if ("reason" in data) return { data, counts: null };
  return {
    data,
    counts: options.supabase ? await persistCurrentPlayerImport(options.supabase, data) : null,
  };
}

export { fetchCurrentPlayerImport } from "./fetch";
export { fetchHistoricalPlayerImport } from "./fetch";
export { normalizePlayerPeriod, normalizeTransactions } from "./normalize";
export { persistCurrentPlayerImport } from "./store";
export type * from "./types";
