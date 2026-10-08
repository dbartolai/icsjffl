import { createClient } from "@supabase/supabase-js";
import { HISTORY_SEASONS } from "../src/lib/espn/history";
import { importEspnSeasons } from "../src/lib/espn/sync/history-import";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

function seasonFromEnv(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 2000 || value > 2100) {
    throw new Error(`${name} must be a four-digit season.`);
  }
  return value;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const firstSeason = seasonFromEnv(
    "ESPN_HISTORY_START_SEASON",
    HISTORY_SEASONS[0],
  );
  const lastSeason = seasonFromEnv(
    "ESPN_HISTORY_END_SEASON",
    HISTORY_SEASONS.at(-1)!,
  );
  if (firstSeason > lastSeason) {
    throw new Error("ESPN_HISTORY_START_SEASON cannot be after the end season.");
  }
  const requestedSeasons = Array.from(
    { length: lastSeason - firstSeason + 1 },
    (_, index) => firstSeason + index,
  );
  const supabase = dryRun
    ? null
    : createClient(
        required("NEXT_PUBLIC_SUPABASE_URL"),
        required("SUPABASE_SECRET_KEY"),
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
        },
      );

  const results = await importEspnSeasons({
    seasons: requestedSeasons,
    supabase,
  });
  for (const result of results) {
    console.log(
      `${dryRun ? "Checked" : "Imported"} ${result.season}: ${result.rows.teams} teams and ${result.rows.games} completed games.`,
    );
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown import error";
  console.error(`History import failed: ${message}`);
  process.exitCode = 1;
});
