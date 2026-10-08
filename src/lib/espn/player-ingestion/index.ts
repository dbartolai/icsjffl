import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchCurrentPlayerImport } from "./fetch";
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

export { fetchCurrentPlayerImport } from "./fetch";
export { normalizePlayerPeriod, normalizeTransactions } from "./normalize";
export { persistCurrentPlayerImport } from "./store";
export type * from "./types";
