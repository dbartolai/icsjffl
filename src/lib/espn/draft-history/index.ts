import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";

export type DraftSourceMetadata = {
  source: "espn:mDraftDetail" | "espn:kona_player_info";
  season: number;
  sourceChecksum: string;
  observedAt: string;
  evidenceStatus: "confirmed";
};

export type ResolvedDraftPlayer = {
  espnPlayerId: number;
  displayName: string;
  defaultPositionId: number | null;
  source: DraftSourceMetadata;
};

export type DraftHistoryRow = {
  leagueId: string;
  season: number;
  teamId: string;
  espnPlayerId: number;
  round: number;
  roundPick: number;
  overallPick: number;
  source: DraftSourceMetadata;
  player: ResolvedDraftPlayer;
};

export type DraftPreviewSeason = {
  season: number;
  pickCount: number;
  resolvedPlayerCount: number;
  expectedPickCount: number | null;
  error: string | null;
};

export type DraftPreview = {
  seasons: DraftPreviewSeason[];
  totalPickCount: number;
  totalResolvedPlayerCount: number;
  errors: number;
};

const draftResponseSchema = z.object({
  id: z.union([z.number().int(), z.string().regex(/^\d+$/)]),
  seasonId: z.number().int(),
  draftDetail: z.object({
    picks: z.array(
      z.object({
        teamId: z.number().int(),
        playerId: z.number().int(),
        roundId: z.number().int(),
        roundPickNumber: z.number().int(),
        overallPickNumber: z.number().int(),
      }),
    ),
  }),
});

const playerResponseSchema = z.object({
  players: z.array(
    z.union([
      z.object({
        player: z.object({
          id: z.number().int(),
          fullName: z.string().trim().min(1),
          defaultPositionId: z.number().int().nullable().optional(),
        }),
      }),
      z.object({
        id: z.number().int(),
        fullName: z.string().trim().min(1),
        defaultPositionId: z.number().int().nullable().optional(),
      }),
    ]),
  ),
});

type FetchOptions = {
  leagueId: string;
  seasons: readonly number[];
  headers: HeadersInit;
  fetcher?: typeof fetch;
};

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function checksum(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function source(
  kind: DraftSourceMetadata["source"],
  payload: unknown,
  observedAt: string,
  season: number,
): DraftSourceMetadata {
  return {
    source: kind,
    season,
    sourceChecksum: checksum(payload),
    observedAt,
    evidenceStatus: "confirmed",
  };
}

function leagueUrl(leagueId: string, season: number): URL {
  const path =
    season < 2018
      ? `/apis/v3/games/ffl/leagueHistory/${leagueId}`
      : `/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${leagueId}`;
  const url = new URL(`https://lm-api-reads.fantasy.espn.com${path}`);
  if (season < 2018) url.searchParams.set("seasonId", String(season));
  return url;
}

function unwrapLegacy(payload: unknown): unknown {
  return Array.isArray(payload) ? payload[0] : payload;
}

function assertDraftKeys(rows: readonly Omit<DraftHistoryRow, "player">[]): void {
  const keys = [
    ["overall pick", (row: Omit<DraftHistoryRow, "player">) => row.overallPick],
    ["round pick", (row: Omit<DraftHistoryRow, "player">) => `${row.round}:${row.roundPick}`],
    ["player", (row: Omit<DraftHistoryRow, "player">) => row.espnPlayerId],
  ] as const;
  for (const [label, key] of keys) {
    const values = new Set<string | number>();
    for (const row of rows) {
      const value = key(row);
      if (values.has(value)) throw new Error(`Duplicate ${label} in draft.`);
      values.add(value);
    }
  }
}

function normalizeDraft(
  payload: unknown,
  leagueId: string,
  expectedSeason: number,
  observedAt: string,
) {
  const raw = draftResponseSchema.parse(unwrapLegacy(payload));
  if (String(raw.id) !== leagueId || raw.seasonId !== expectedSeason) {
    throw new Error("ESPN draft response does not match the requested league season.");
  }
  const metadata = source("espn:mDraftDetail", payload, observedAt, expectedSeason);
  const rows = raw.draftDetail.picks.map((pick) => {
    if (
      pick.teamId <= 0 ||
      pick.roundId <= 0 ||
      pick.roundPickNumber <= 0 ||
      pick.overallPickNumber <= 0
    ) {
      throw new Error("Draft pick has an invalid natural key.");
    }
    return {
      leagueId,
      season: expectedSeason,
      teamId: String(pick.teamId),
      espnPlayerId: pick.playerId,
      round: pick.roundId,
      roundPick: pick.roundPickNumber,
      overallPick: pick.overallPickNumber,
      source: metadata,
    };
  });
  assertDraftKeys(rows);
  return rows;
}

async function fetchJson(url: URL, headers: HeadersInit, fetcher: typeof fetch) {
  let response: Response;
  try {
    response = await fetcher(url, {
      headers,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error("ESPN could not be reached.");
  }
  if (!response.ok) throw new Error(`ESPN returned HTTP ${response.status}.`);
  try {
    return await response.json();
  } catch {
    throw new Error("ESPN returned invalid JSON.");
  }
}

async function resolvePlayers(
  leagueId: string,
  season: number,
  ids: readonly number[],
  headers: HeadersInit,
  fetcher: typeof fetch,
) {
  const resolved = new Map<number, ResolvedDraftPlayer>();
  for (let offset = 0; offset < ids.length; offset += 50) {
    const batch = ids.slice(offset, offset + 50);
    const url = leagueUrl(leagueId, season);
    url.searchParams.append("view", "kona_player_info");
    const observedAt = new Date().toISOString();
    const playerHeaders = new Headers(headers);
    playerHeaders.set(
      "x-fantasy-filter",
      JSON.stringify({ players: { filterIds: { value: batch } } }),
    );
    const payload = await fetchJson(url, playerHeaders, fetcher);
    const raw = playerResponseSchema.parse(unwrapLegacy(payload));
    const metadata = source("espn:kona_player_info", payload, observedAt, season);
    for (const entry of raw.players) {
      const player = "player" in entry ? entry.player : entry;
      if (!ids.includes(player.id)) continue;
      const next: ResolvedDraftPlayer = {
        espnPlayerId: player.id,
        displayName: player.fullName,
        defaultPositionId: player.defaultPositionId ?? null,
        source: metadata,
      };
      const existing = resolved.get(player.id);
      if (
        existing &&
        (existing.displayName !== next.displayName ||
          existing.defaultPositionId !== next.defaultPositionId)
      ) {
        throw new Error("ESPN returned conflicting player identities.");
      }
      resolved.set(player.id, next);
    }
  }
  const missing = ids.filter((id) => !resolved.has(id));
  if (missing.length) throw new Error("ESPN did not resolve every drafted player.");
  return resolved;
}

export async function fetchDraftHistory(
  options: FetchOptions,
): Promise<DraftHistoryRow[]> {
  return fetchDraftHistoryWithCache(options, new Map());
}

function playerCacheKey(season: number, playerId: number): string {
  return `${season}:${playerId}`;
}

async function fetchDraftHistoryWithCache(
  options: FetchOptions,
  cache: Map<string, ResolvedDraftPlayer>,
): Promise<DraftHistoryRow[]> {
  if (!/^\d+$/.test(options.leagueId)) throw new Error("ESPN league ID must be numeric.");
  const fetcher = options.fetcher ?? fetch;
  const rows: DraftHistoryRow[] = [];
  for (const season of options.seasons) {
    if (!Number.isInteger(season) || season < 2000 || season > 2100) {
      throw new Error("Draft season must be a four-digit year.");
    }
    const url = leagueUrl(options.leagueId, season);
    url.searchParams.append("view", "mDraftDetail");
    const payload = await fetchJson(url, options.headers, fetcher);
    const draft = normalizeDraft(payload, options.leagueId, season, new Date().toISOString());
    const ids = draft.map((row) => row.espnPlayerId);
    const unresolved = ids.filter((id) => !cache.has(playerCacheKey(season, id)));
    const players = await resolvePlayers(
      options.leagueId,
      season,
      unresolved,
      options.headers,
      fetcher,
    );
    for (const [id, player] of players) cache.set(playerCacheKey(season, id), player);
    rows.push(
      ...draft.map((row) => ({
        ...row,
        player: cache.get(playerCacheKey(season, row.espnPlayerId))!,
      })),
    );
  }
  return rows;
}

export async function previewDraftHistory(options: FetchOptions & {
  expectedPickCount?: number;
}): Promise<DraftPreview> {
  const seasons: DraftPreviewSeason[] = [];
  const cache = new Map<string, ResolvedDraftPlayer>();
  for (const season of options.seasons) {
    try {
      const rows = await fetchDraftHistoryWithCache(
        { ...options, seasons: [season] },
        cache,
      );
      const expectedPickCount = options.expectedPickCount ?? null;
      if (expectedPickCount !== null && rows.length !== expectedPickCount) {
        throw new Error("Draft pick count does not match the audited league count.");
      }
      seasons.push({
        season,
        pickCount: rows.length,
        resolvedPlayerCount: new Set(rows.map((row) => row.espnPlayerId)).size,
        expectedPickCount,
        error: null,
      });
    } catch {
      seasons.push({
        season,
        pickCount: 0,
        resolvedPlayerCount: 0,
        expectedPickCount: options.expectedPickCount ?? null,
        error: "Draft preview failed. Check the league credentials and ESPN availability.",
      });
    }
  }
  return {
    seasons,
    totalPickCount: seasons.reduce((total, season) => total + season.pickCount, 0),
    totalResolvedPlayerCount: seasons.reduce(
      (total, season) => total + season.resolvedPlayerCount,
      0,
    ),
    errors: seasons.filter((season) => season.error).length,
  };
}
