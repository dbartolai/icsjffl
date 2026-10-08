import { createClient } from "@supabase/supabase-js";
import { fetchDraftHistory } from "../src/lib/espn/draft-history";
import { persistDraftHistory } from "../src/lib/espn/draft-persistence";

const FIRST_SEASON = 2017;
const LAST_SEASON = 2026;
const EXPECTED_PICK_COUNT = 160;

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Set ${name} before importing ESPN drafts.`);
  if (/[;\r\n]/.test(value)) throw new Error(`${name} has an invalid format.`);
  return value;
}

function localSupabaseUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must be a valid local URL.");
  }
  if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
    throw new Error("--apply only writes to a local Supabase instance.");
  }
  return url.toString();
}

async function main() {
  const apply = process.argv.includes("--apply");
  if (process.argv.some((argument) => ![process.argv[0], process.argv[1], "--apply"].includes(argument))) {
    throw new Error("Use --apply to write to local Supabase, or omit it for a dry run.");
  }
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
  if (!apply) {
    console.log(JSON.stringify({ mode: "dry-run", seasons: seasonCounts, picks: rows.length }));
    return;
  }
  const supabase = createClient(
    localSupabaseUrl(required("NEXT_PUBLIC_SUPABASE_URL")),
    required("SUPABASE_SECRET_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );
  const counts = await persistDraftHistory(supabase, rows, { expectedPickCount: EXPECTED_PICK_COUNT });
  console.log(JSON.stringify({ mode: "apply", leagueId, ...counts, seasons: seasonCounts }));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Draft import failed.");
  process.exitCode = 1;
});
