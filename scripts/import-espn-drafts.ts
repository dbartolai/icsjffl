import { createClient } from "@supabase/supabase-js";
import { fetchDraftHistory } from "../src/lib/espn/draft-history";
import { persistDraftHistory } from "../src/lib/espn/draft-persistence";
import { parseImportTargetFlags, resolveImportTarget } from "../src/lib/espn/import-target";

const FIRST_SEASON = 2017;
const LAST_SEASON = 2026;
const EXPECTED_PICK_COUNT = 160;

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Set ${name} before importing ESPN drafts.`);
  if (/[;\r\n]/.test(value)) throw new Error(`${name} has an invalid format.`);
  return value;
}

async function main() {
  const args = process.argv.slice(2);
  const { apply, applyProduction, expectedProjectRef } = parseImportTargetFlags(args);
  const target = resolveImportTarget({
    apply,
    applyProduction,
    expectedProjectRef,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  });
  const leagueId = required("ESPN_LEAGUE_ID");
  if (!/^\d+$/.test(leagueId)) throw new Error("ESPN_LEAGUE_ID must be numeric.");
  const rows = await fetchDraftHistory({
    leagueId,
    seasons: Array.from({ length: LAST_SEASON - FIRST_SEASON + 1 }, (_, index) => FIRST_SEASON + index),
    headers: {
      Accept: "application/json",
      Cookie: `espn_s2=${required("ESPN_S2")}; SWID=${required("ESPN_SWID")}`,
    },
  });
  const seasonCounts = Object.fromEntries(
    Array.from({ length: LAST_SEASON - FIRST_SEASON + 1 }, (_, index) => {
      const season = FIRST_SEASON + index;
      return [season, rows.filter((row) => row.season === season).length];
    }),
  );
  if (Object.values(seasonCounts).some((count) => count !== EXPECTED_PICK_COUNT)) {
    throw new Error("Draft import will not claim a complete import with missing picks.");
  }
  if (target.mode === "dry-run") {
    console.log(JSON.stringify({ mode: "dry-run", seasons: seasonCounts, picks: rows.length }));
    return;
  }
  const supabase = createClient(
    target.url,
    required("SUPABASE_SECRET_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );
  const counts = await persistDraftHistory(supabase, rows, { expectedPickCount: EXPECTED_PICK_COUNT });
  console.log(JSON.stringify({ mode: target.mode, leagueId, ...counts, seasons: seasonCounts }));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Draft import failed.");
  process.exitCode = 1;
});
