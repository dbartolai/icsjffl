import { createClient } from "@supabase/supabase-js";
import { importHistoricalPlayerSeason } from "../src/lib/espn/player-ingestion";
import { resolveImportTarget, type ImportTarget } from "../src/lib/espn/import-target";

type Arguments = {
  season: number;
  firstScoringPeriod?: number;
  lastScoringPeriod?: number;
  target: ImportTarget;
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
  let applyProduction = false;
  let expectedProjectRef: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--apply") apply = true;
    else if (argument === "--apply-production") applyProduction = true;
    else if (argument === "--expected-project-ref") expectedProjectRef = argv[++index];
    else if (argument === "--season") season = positiveInteger(argv[++index] ?? "", "--season");
    else if (argument === "--from-week") firstScoringPeriod = positiveInteger(argv[++index] ?? "", "--from-week");
    else if (argument === "--to-week") lastScoringPeriod = positiveInteger(argv[++index] ?? "", "--to-week");
    else throw new Error("Use --season YEAR [--from-week N] [--to-week N] [--apply | --apply-production --expected-project-ref kolfqdrpssngbineozjd].");
  }
  if (!season) throw new Error("Choose one season with --season to keep each backfill run bounded.");
  if ((firstScoringPeriod === undefined) !== (lastScoringPeriod === undefined)) {
    throw new Error("Use --from-week and --to-week together.");
  }
  return {
    season,
    firstScoringPeriod,
    lastScoringPeriod,
    target: resolveImportTarget({
      apply,
      applyProduction,
      expectedProjectRef,
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    }),
  };
}

async function main() {
  const options = argumentsFor(process.argv.slice(2));
  const supabase = options.target.mode !== "dry-run"
    ? createClient(options.target.url, required("SUPABASE_SECRET_KEY"), {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      })
    : null;
  const result = await importHistoricalPlayerSeason({ ...options, supabase });
  if ("reason" in result.data) {
    console.log(JSON.stringify({ mode: options.target.mode, ...result.data }));
    return;
  }
  const data = result.data;
  console.log(JSON.stringify({
    mode: options.target.mode,
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
