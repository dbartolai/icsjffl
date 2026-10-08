import { createClient } from "@supabase/supabase-js";
import { importHistoricalPlayerSeason } from "../src/lib/espn/player-ingestion";

type Arguments = {
  season: number;
  firstScoringPeriod?: number;
  lastScoringPeriod?: number;
  apply: boolean;
};

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Set ${name} before importing historical players.`);
  return value;
}

function positiveInteger(value: string, name: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer.`);
  return parsed;
}

function argumentsFor(argv: string[]): Arguments {
  let season: number | undefined;
  let firstScoringPeriod: number | undefined;
  let lastScoringPeriod: number | undefined;
  let apply = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--apply") apply = true;
    else if (argument === "--season") season = positiveInteger(argv[++index] ?? "", "--season");
    else if (argument === "--from-week") firstScoringPeriod = positiveInteger(argv[++index] ?? "", "--from-week");
    else if (argument === "--to-week") lastScoringPeriod = positiveInteger(argv[++index] ?? "", "--to-week");
    else throw new Error("Use --season YEAR [--from-week N] [--to-week N] [--apply].");
  }
  if (!season) throw new Error("Choose one season with --season to keep each backfill run bounded.");
  if ((firstScoringPeriod === undefined) !== (lastScoringPeriod === undefined)) {
    throw new Error("Use --from-week and --to-week together.");
  }
  return { season, firstScoringPeriod, lastScoringPeriod, apply };
}

function localSupabaseUrl() {
  const value = required("NEXT_PUBLIC_SUPABASE_URL");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must be a valid local URL for --apply.");
  }
  if (!new Set(["localhost", "127.0.0.1", "::1"]).has(url.hostname)) {
    throw new Error("Historical --apply only writes to a local Supabase database.");
  }
  return value;
}

async function main() {
  const options = argumentsFor(process.argv.slice(2));
  const supabase = options.apply
    ? createClient(localSupabaseUrl(), required("SUPABASE_SECRET_KEY"), {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      })
    : null;
  const result = await importHistoricalPlayerSeason({ ...options, supabase });
  if ("reason" in result.data) {
    console.log(JSON.stringify({ mode: options.apply ? "apply" : "dry-run", ...result.data }));
    return;
  }
  const data = result.data;
  console.log(JSON.stringify({
    mode: options.apply ? "apply" : "dry-run",
    season: data.season,
    firstScoringPeriod: data.periods.at(0)?.coverage.scoringPeriodId ?? null,
    lastScoringPeriod: data.periods.at(-1)?.coverage.scoringPeriodId ?? null,
    periods: data.periods.length,
    entries: data.periods.reduce((count, period) => count + period.entries.length, 0),
    lineupPeriods: data.periods.filter((period) => period.coverage.lineupEvidenceStatus === "confirmed").length,
    actualScorePeriods: data.periods.filter((period) => period.coverage.actualScoreEvidenceStatus === "confirmed").length,
    projectionPeriods: data.periods.filter((period) => period.coverage.projectionEvidenceStatus === "confirmed").length,
    counts: result.counts,
  }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Historical player import failed.");
  process.exitCode = 1;
});
