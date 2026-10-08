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

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function summarizeEspnInjuries(payload: unknown) {
  const groups = array(object(payload)?.injuries);
  const injuries = groups.flatMap((group) => array(object(group)?.injuries));
  const rows = injuries.map(object).filter((row): row is JsonObject => row !== null);

  return {
    reportGroups: groups.length,
    injuryRows: rows.length,
    rowsWithDate: rows.filter((row) => typeof row.date === "string").length,
    rowsWithStatus: rows.filter((row) => row.status !== undefined).length,
    rowsWithAthleteId: rows.filter(
      (row) => object(row.athlete)?.id !== undefined,
    ).length,
  };
}

async function probeUrl(url: string, method: "GET" | "HEAD"): Promise<ProbeResult> {
  try {
    const response = await fetch(url, {
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
      ...(await probeUrl(`${NFLVERSE_INJURIES_URL}${season}.csv`, "HEAD")),
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
