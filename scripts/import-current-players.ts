import { createClient } from "@supabase/supabase-js";
import {
  importCurrentPlayerSeason,
  persistCurrentPlayerImport,
} from "../src/lib/espn/player-ingestion";
import { importEspnSeasons } from "../src/lib/espn/sync/history-import";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Set ${name} before importing current players.`);
  return value;
}

function season() {
  const year = new Date().getUTCFullYear();
  return new Date().getUTCMonth() < 2 ? year - 1 : year;
}

async function main() {
  const apply = process.argv.includes("--apply");
  if (process.argv.some((argument) => argument !== "--apply" && argument !== process.argv[0] && argument !== process.argv[1])) {
    throw new Error("Use --apply to write current player data, or omit it for a dry run.");
  }
  const currentSeason = season();
  if (!apply) {
    const { data } = await importCurrentPlayerSeason({ season: currentSeason });
    console.log(
      JSON.stringify({
        mode: "dry-run",
        season: data.season,
        periods: data.periods.length,
        entries: data.periods.reduce((count, period) => count + period.entries.length, 0),
        transactions: data.transactions.length,
      }),
    );
    return;
  }
  const leagueId = required("ESPN_LEAGUE_ID");
  const supabase = createClient(
    required("NEXT_PUBLIC_SUPABASE_URL"),
    required("SUPABASE_SECRET_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );
  const { data } = await importCurrentPlayerSeason({ season: currentSeason });
  await importEspnSeasons({ seasons: [currentSeason], supabase });
  const counts = await persistCurrentPlayerImport(supabase, data);
  console.log(JSON.stringify({ mode: "apply", leagueId, season: currentSeason, ...counts }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Current player import failed.");
  process.exitCode = 1;
});
