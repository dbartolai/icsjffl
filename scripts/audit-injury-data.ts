type JsonObject = Record<string, unknown>;

type ProbeResult = {
  status: number | null;
  reachable: boolean;
  contentType: string | null;
  contentLength: string | null;
  lastModified: string | null;
};

const ESPN_INJURIES_URL =
  "https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries";
const NFLVERSE_INJURIES_URL =
  "https://github.com/nflverse/nflverse-data/releases/download/injuries/injuries_";
const SAMPLE_SEASONS = [2009, 2017, 2018, 2025];
const REQUEST_TIMEOUT_MS = 15_000;
const ESPN_PLAYER_PATH = /^\/nfl\/player\/_\/id\/(\d+)(?:\/|$)/;
const ESPN_PLAYER_PATH_PREFIX = "/nfl/player/_/id/";

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function espnAthleteIdFromHref(value: unknown) {
  if (typeof value !== "string") {
    return { athleteId: null, malformed: false };
  }

  try {
    const url = new URL(value);
    if (
      url.hostname !== "www.espn.com" ||
      !url.pathname.startsWith(ESPN_PLAYER_PATH_PREFIX)
    ) {
      return { athleteId: null, malformed: false };
    }
    return {
      athleteId:
        url.protocol === "https:"
          ? (url.pathname.match(ESPN_PLAYER_PATH)?.[1] ?? null)
          : null,
      malformed:
        url.protocol !== "https:" || !ESPN_PLAYER_PATH.test(url.pathname),
    };
  } catch {
    return { athleteId: null, malformed: false };
  }
}

export function summarizeEspnInjuries(payload: unknown) {
  const groups = array(object(payload)?.injuries);
  const injuries = groups.flatMap((group) => array(object(group)?.injuries));
  const rows = injuries.map(object).filter((row): row is JsonObject => row !== null);

  const linkEvidence = rows.map((row) => {
    const links = array(object(row.athlete)?.links);
    const athleteIds = new Set<string>();
    let hasMalformedHref = false;

    for (const linkValue of links) {
      const href = object(linkValue)?.href;
      const { athleteId, malformed } = espnAthleteIdFromHref(href);
      if (athleteId !== null) {
        athleteIds.add(athleteId);
      }
      if (malformed) {
        hasMalformedHref = true;
      }
    }

    return { athleteIds, hasMalformedHref };
  });

  return {
    reportGroups: groups.length,
    injuryRows: rows.length,
    rowsWithDate: rows.filter((row) => typeof row.date === "string").length,
    rowsWithStatus: rows.filter((row) => row.status !== undefined).length,
    rowsWithDirectAthleteId: rows.filter(
      (row) => object(row.athlete)?.id !== undefined,
    ).length,
    rowsWithExactlyOneEspnAthleteLinkId: linkEvidence.filter(
      ({ athleteIds }) => athleteIds.size === 1,
    ).length,
    rowsWithConflictingEspnAthleteLinkIds: linkEvidence.filter(
      ({ athleteIds }) => athleteIds.size > 1,
    ).length,
    rowsWithNoEspnAthleteLinkId: linkEvidence.filter(
      ({ athleteIds }) => athleteIds.size === 0,
    ).length,
    rowsWithMalformedAthleteLinkHref: linkEvidence.filter(
      ({ hasMalformedHref }) => hasMalformedHref,
    ).length,
  };
}

async function probeUrl(
  fetchImpl: typeof fetch,
  url: string,
  method: "GET" | "HEAD",
): Promise<ProbeResult> {
  try {
    const response = await fetchImpl(url, {
      method,
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    return {
      status: response.status,
      reachable: response.ok,
      contentType: response.headers.get("content-type"),
      contentLength: response.headers.get("content-length"),
      lastModified: response.headers.get("last-modified"),
    };
  } catch {
    return {
      status: null,
      reachable: false,
      contentType: null,
      contentLength: null,
      lastModified: null,
    };
  }
}

export async function auditInjuryData(fetchImpl = fetch) {
  const checkedAt = new Date().toISOString();
  const espnResponse = await fetchImpl(ESPN_INJURIES_URL, {
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const espnPayload = await espnResponse.json();
  const nflverse = await Promise.all(
    SAMPLE_SEASONS.map(async (season) => ({
      season,
      ...(await probeUrl(
        fetchImpl,
        `${NFLVERSE_INJURIES_URL}${season}.csv`,
        "HEAD",
      )),
    })),
  );

  return {
    checkedAt,
    espnCurrent: {
      status: espnResponse.status,
      reachable: espnResponse.ok,
      ...summarizeEspnInjuries(espnPayload),
    },
    nflverseHistorical: nflverse,
  };
}

if (process.argv[1]?.endsWith("audit-injury-data.ts")) {
  auditInjuryData()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch(() => {
      console.error("Injury-source audit probe failed without printing provider data.");
      process.exitCode = 1;
    });
}
