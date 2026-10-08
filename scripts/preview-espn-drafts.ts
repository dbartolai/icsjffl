import {
  previewDraftHistory,
} from "../src/lib/espn/draft-history";

const FIRST_AUDITED_SEASON = 2017;
const LAST_AUDITED_SEASON = 2026;
const AUDITED_PICK_COUNT = 160;

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Set ${name} before previewing ESPN drafts.`);
  if (/[;\r\n]/.test(value)) throw new Error(`${name} has an invalid format.`);
  return value;
}

function main() {
  const leagueId = requiredEnv("ESPN_LEAGUE_ID");
  if (!/^\d+$/.test(leagueId)) throw new Error("ESPN_LEAGUE_ID must be numeric.");
  const s2 = requiredEnv("ESPN_S2");
  const swid = requiredEnv("ESPN_SWID");
  const seasons = Array.from(
    { length: LAST_AUDITED_SEASON - FIRST_AUDITED_SEASON + 1 },
    (_, index) => FIRST_AUDITED_SEASON + index,
  );
  return previewDraftHistory({
    leagueId,
    seasons,
    expectedPickCount: AUDITED_PICK_COUNT,
    headers: {
      Accept: "application/json",
      Cookie: `espn_s2=${s2}; SWID=${swid}`,
    },
  });
}

main()
  .then((preview) => {
    console.log("season picks resolved expected status");
    for (const season of preview.seasons) {
      console.log(
        [
          season.season,
          season.pickCount,
          season.resolvedPlayerCount,
          season.expectedPickCount ?? "-",
          season.error ? "error" : "ok",
        ].join(" "),
      );
    }
    console.log(
      `total ${preview.totalPickCount} ${preview.totalResolvedPlayerCount} ${AUDITED_PICK_COUNT * seasonsForTotal()} ${preview.errors ? "errors" : "ok"}`,
    );
    if (preview.errors) process.exitCode = 1;
  })
  .catch(() => {
    console.error("Draft preview failed. Check local ESPN configuration.");
    process.exitCode = 1;
  });

function seasonsForTotal() {
  return LAST_AUDITED_SEASON - FIRST_AUDITED_SEASON + 1;
}
