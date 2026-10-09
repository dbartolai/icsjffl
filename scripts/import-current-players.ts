import { createClient } from "@supabase/supabase-js";
import {
  importCurrentPlayerSeason,
  persistCurrentPlayerImport,
} from "../src/lib/espn/player-ingestion";
import { importEspnSeasons } from "../src/lib/espn/sync/history-import";
import { resolveImportTarget } from "../src/lib/espn/import-target";

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
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const applyProduction = args.includes("--apply-production");
  const expectedProjectRef = args.at(args.indexOf("--expected-project-ref") + 1);
  if (args.some((argument, index) => !["--apply", "--apply-production", "--expected-project-ref"].includes(argument) && args[index - 1] !== "--expected-project-ref")) {
    throw new Error("Use --apply for local writes, or --apply-production --expected-project-ref kolfqdrpssngbineozjd.");
  }
  if (args.filter((argument) => argument === "--expected-project-ref").length > 1 || args.includes("--expected-project-ref") !== Boolean(expectedProjectRef)) {
    throw new Error("--expected-project-ref requires one value.");
  }
  const target = resolveImportTarget({
    apply,
    applyProduction,
    expectedProjectRef,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  });
  const currentSeason = season();
  if (target.mode === "dry-run") {
    const { data } = await importCurrentPlayerSeason({ season: currentSeason });
    console.log(
      JSON.stringify({
        mode: "dry-run",
        season: data.season,
        periods: data.periods.length,
        entries: data.periods.reduce((count, period) => count + period.entries.length, 0),
        transactions: data.transactions.length,
        actualScorePeriods: data.periods.filter(
          (period) => period.coverage.actualScoreEvidenceStatus === "confirmed",
        ).length,
        projectionPeriods: data.periods.filter(
          (period) => period.coverage.projectionEvidenceStatus === "confirmed",
        ).length,
        confirmedTransactionPeriods: data.periods.filter(
          (period) => period.coverage.transactionEvidenceStatus === "confirmed",
        ).length,
      }),
    );
    return;
  }
  const leagueId = required("ESPN_LEAGUE_ID");
  const supabase = createClient(
    target.url,
    required("SUPABASE_SECRET_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );
  const { data } = await importCurrentPlayerSeason({ season: currentSeason });
  await importEspnSeasons({ seasons: [currentSeason], supabase });
  const counts = await persistCurrentPlayerImport(supabase, data);
  console.log(JSON.stringify({ mode: target.mode, leagueId, season: currentSeason, ...counts }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Current player import failed.");
  process.exitCode = 1;
});
