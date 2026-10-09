type JsonObject = Record<string, unknown>;

type InjuryAthlete = {
  profileId: string;
  displayName: string | null;
};

type CrosswalkOptions = {
  fetchImpl?: typeof fetch;
  leagueId: string;
  requestHeaders?: HeadersInit;
  season?: number;
  sampleSize?: number;
  batchSize?: number;
};

const ESPN_INJURIES_URL =
  "https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries";
const ESPN_PLAYER_PATH = /^\/nfl\/player\/_\/id\/(\d+)(?:\/|$)/;
const DEFAULT_SAMPLE_SIZE = 40;
const DEFAULT_BATCH_SIZE = 20;
const REQUEST_TIMEOUT_MS = 15_000;

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function string(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function profileIdFromHref(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "www.espn.com"
      ? (url.pathname.match(ESPN_PLAYER_PATH)?.[1] ?? null)
      : null;
  } catch {
    return null;
  }
}

function injuryAthletes(payload: unknown) {
  const athletes: InjuryAthlete[] = [];
  for (const groupValue of array(object(payload)?.injuries)) {
    for (const injuryValue of array(object(groupValue)?.injuries)) {
      const athlete = object(object(injuryValue)?.athlete);
      const ids = new Set(
        array(athlete?.links)
          .map((link) => profileIdFromHref(object(link)?.href))
          .filter((id): id is string => id !== null),
      );
      if (ids.size !== 1) continue;
      athletes.push({ profileId: [...ids][0], displayName: string(athlete?.displayName) });
    }
  }
  return athletes;
}

function leagueUrl(leagueId: string, season: number) {
  return new URL(
    `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${leagueId}`,
  );
}

function playerRecords(payload: unknown) {
  return array(object(payload)?.players).flatMap((value) => {
    const entry = object(value);
    const player = object(entry?.player) ?? entry;
    const id = typeof player?.id === "number" ? String(player.id) : null;
    const fullName = string(player?.fullName);
    return id && fullName ? [{ id, fullName }] : [];
  });
}

async function fetchPlayers(input: {
  fetchImpl: typeof fetch;
  leagueId: string;
  requestHeaders?: HeadersInit;
  season: number;
  ids: string[];
}) {
  const url = leagueUrl(input.leagueId, input.season);
  url.searchParams.append("view", "kona_player_info");
  const headers = new Headers(input.requestHeaders);
  headers.set("Accept", "application/json");
  headers.set(
    "x-fantasy-filter",
    JSON.stringify({
      players: { filterIds: { value: input.ids.map(Number) } },
    }),
  );
  const response = await input.fetchImpl(url, {
    headers,
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`ESPN returned HTTP ${response.status} for player info.`);
  return playerRecords(await response.json());
}

export async function auditInjuryCrosswalk(options: CrosswalkOptions) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const season = options.season ?? 2026;
  const sampleSize = options.sampleSize ?? DEFAULT_SAMPLE_SIZE;
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  if (!/^\d+$/.test(options.leagueId)) throw new Error("ESPN_LEAGUE_ID must be numeric.");
  if (!Number.isInteger(sampleSize) || sampleSize < 1 || !Number.isInteger(batchSize) || batchSize < 1) {
    throw new Error("The crosswalk sample and batch sizes must be positive integers.");
  }

  const injuryResponse = await fetchImpl(ESPN_INJURIES_URL, {
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!injuryResponse.ok) throw new Error(`ESPN returned HTTP ${injuryResponse.status} for injuries.`);
  const athletes = injuryAthletes(await injuryResponse.json());
  const byId = new Map<string, InjuryAthlete>();
  for (const athlete of athletes) byId.set(athlete.profileId, athlete);
  const selected = [...byId.values()].slice(0, sampleSize);
  const returned = new Map<string, string>();
  for (let offset = 0; offset < selected.length; offset += batchSize) {
    for (const player of await fetchPlayers({
      fetchImpl,
      leagueId: options.leagueId,
      requestHeaders: options.requestHeaders,
      season,
      ids: selected.slice(offset, offset + batchSize).map(({ profileId }) => profileId),
    })) {
      returned.set(player.id, player.fullName);
    }
  }

  const unresolved = selected.filter(({ profileId }) => !returned.has(profileId));
  let individuallyReturned = 0;
  for (const { profileId } of unresolved) {
    if ((await fetchPlayers({
      fetchImpl,
      leagueId: options.leagueId,
      requestHeaders: options.requestHeaders,
      season,
      ids: [profileId],
    })).some(
      (player) => player.id === profileId,
    )) individuallyReturned += 1;
  }
  const exactNameMatches = selected.filter(({ profileId, displayName }) =>
    displayName !== null && returned.get(profileId) === displayName,
  ).length;
  const returnedWithDifferentName = selected.filter(({ profileId, displayName }) =>
    returned.has(profileId) && displayName !== null && returned.get(profileId) !== displayName,
  ).length;

  return {
    checkedAt: new Date().toISOString(),
    season,
    injuryRowsWithOneProfileLinkId: athletes.length,
    uniqueProfileLinkIds: byId.size,
    sampleRequested: selected.length,
    sampleLimit: sampleSize,
    batchSize,
    playerRecordsReturnedForRequestedIds: selected.filter(({ profileId }) => returned.has(profileId)).length,
    exactIdAndNameMatches: exactNameMatches,
    returnedIdsWithDifferentName: returnedWithDifferentName,
    unresolvedAfterBatch: unresolved.length,
    unresolvedReturnedOnIndividualRetry: individuallyReturned,
    unresolvedAfterIndividualRetry: unresolved.length - individuallyReturned,
  };
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Set ${name} before running the injury crosswalk audit.`);
  if (/[;\r\n]/.test(value)) throw new Error(`${name} has an invalid format.`);
  return value;
}

if (process.argv[1]?.endsWith("audit-injury-crosswalk.ts")) {
  auditInjuryCrosswalk({
    leagueId: requiredEnv("ESPN_LEAGUE_ID"),
    requestHeaders: {
      Cookie: `espn_s2=${requiredEnv("ESPN_S2")}; SWID=${requiredEnv("ESPN_SWID")}`,
    },
  })
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch(() => {
      console.error("Injury crosswalk audit failed without printing provider data.");
      process.exitCode = 1;
    });
}
