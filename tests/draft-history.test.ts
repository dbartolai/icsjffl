import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fetchDraftHistory,
  previewDraftHistory,
} from "../src/lib/espn/draft-history";
import { persistDraftHistory } from "../src/lib/espn/draft-persistence";

type Pick = {
  teamId: number;
  playerId: number;
  roundId: number;
  roundPickNumber: number;
  overallPickNumber: number;
};

function draftPayload(season: number, picks: Pick[]) {
  return {
    id: 123,
    seasonId: season,
    draftDetail: { picks },
  };
}

function playerPayload(ids: number[]) {
  return {
    players: ids.map((id) => ({
      player: {
        id,
        fullName: `Fixture Player ${id}`,
        defaultPositionId: id < 0 ? 16 : 1,
      },
    })),
  };
}

function fetcherFor(season: number, picks: Pick[]): typeof fetch {
  return async (input, init) => {
    const url = new URL(String(input));
    if (url.searchParams.get("view") === "mDraftDetail") {
      return Response.json(season < 2018 ? [draftPayload(season, picks)] : draftPayload(season, picks));
    }
    const filter = JSON.parse(
      new Headers(init?.headers).get("x-fantasy-filter") ?? "{}",
    ) as { players: { filterIds: { value: number[] } } };
    return Response.json(playerPayload(filter.players.filterIds.value));
  };
}

const picks: Pick[] = [
  { teamId: 1, playerId: 10, roundId: 1, roundPickNumber: 1, overallPickNumber: 1 },
  { teamId: 2, playerId: -20, roundId: 1, roundPickNumber: 2, overallPickNumber: 2 },
];

test("normalizes the 2017 wrapper and accepts negative D/ST player IDs", async () => {
  const rows = await fetchDraftHistory({
    leagueId: "123",
    seasons: [2017],
    headers: {},
    fetcher: fetcherFor(2017, picks),
  });
  assert.deepEqual(
    rows.map((row) => [row.season, row.teamId, row.espnPlayerId, row.overallPick]),
    [[2017, "1", 10, 1], [2017, "2", -20, 2]],
  );
  assert.equal(rows[1].player.defaultPositionId, 16);
  assert.match(rows[0].source.sourceChecksum, /^[0-9a-f]{64}$/);
  assert.equal(rows[0].source.evidenceStatus, "confirmed");
});

test("rejects duplicate draft natural keys before player resolution", async () => {
  await assert.rejects(
    fetchDraftHistory({
      leagueId: "123",
      seasons: [2026],
      headers: {},
      fetcher: fetcherFor(2026, [picks[0], { ...picks[1], overallPickNumber: 1 }]),
    }),
    /Duplicate overall pick/,
  );
});

test("rejects malformed draft keys and an invalid legacy wrapper", async () => {
  await assert.rejects(
    fetchDraftHistory({
      leagueId: "123",
      seasons: [2026],
      headers: {},
      fetcher: fetcherFor(2026, [{ ...picks[0], teamId: 0 }]),
    }),
    /invalid natural key/,
  );
  await assert.rejects(
    fetchDraftHistory({
      leagueId: "123",
      seasons: [2017],
      headers: {},
      fetcher: async () => Response.json([]),
    }),
  );
});

test("rejects missing player identities", async () => {
  await assert.rejects(
    fetchDraftHistory({
      leagueId: "123",
      seasons: [2026],
      headers: {},
      fetcher: async (input) => {
        const url = new URL(String(input));
        return Response.json(
          url.searchParams.get("view") === "mDraftDetail"
            ? draftPayload(2026, picks)
            : { players: [playerPayload([10]).players[0]] },
        );
      },
    }),
    /did not resolve every drafted player/,
  );
});

test("rejects conflicting player identities", async () => {
  await assert.rejects(
    fetchDraftHistory({
      leagueId: "123",
      seasons: [2026],
      headers: {},
      fetcher: async (input) => {
        const url = new URL(String(input));
        return Response.json(
          url.searchParams.get("view") === "mDraftDetail"
            ? draftPayload(2026, [picks[0]])
            : {
                players: [
                  playerPayload([10]).players[0],
                  {
                    player: {
                      id: 10,
                      fullName: "Conflicting Fixture Player",
                      defaultPositionId: 1,
                    },
                  },
                ],
              },
        );
      },
    }),
    /conflicting player identities/,
  );
});

test("returns count-only preview results and does not leak upstream failures", async () => {
  const preview = await previewDraftHistory({
    leagueId: "123",
    seasons: [2017, 2026],
    expectedPickCount: 2,
    headers: {},
    fetcher: async (input, init) => {
      const url = new URL(String(input));
      const season = Number(url.searchParams.get("seasonId") ?? url.pathname.match(/seasons\/(\d+)/)?.[1]);
      if (season === 2026) throw new Error("private cookie body");
      return fetcherFor(2017, picks)(input, init);
    },
  });
  assert.deepEqual(preview.seasons[0], {
    season: 2017,
    pickCount: 2,
    resolvedPlayerCount: 2,
    expectedPickCount: 2,
    error: null,
  });
  assert.equal(preview.seasons[1].error, "Draft preview failed. Check the league credentials and ESPN availability.");
  assert.equal(JSON.stringify(preview).includes("private cookie body"), false);
});

test("caches player identities for repeated historical draft IDs", async () => {
  let playerRequests = 0;
  const rows = await fetchDraftHistory({
    leagueId: "123",
    seasons: [2017, 2017],
    headers: {},
    fetcher: async (input, init) => {
      const url = new URL(String(input));
      const season = Number(
        url.searchParams.get("seasonId") ??
          url.pathname.match(/seasons\/(\d+)/)?.[1],
      );
      if (url.searchParams.get("view") === "mDraftDetail") {
        return Response.json(
          season < 2018 ? [draftPayload(season, picks)] : draftPayload(season, picks),
        );
      }
      playerRequests += 1;
      const filter = JSON.parse(
        new Headers(init?.headers).get("x-fantasy-filter") ?? "{}",
      ) as { players: { filterIds: { value: number[] } } };
      return Response.json(playerPayload(filter.players.filterIds.value));
    },
  });
  assert.equal(rows.length, 4);
  assert.equal(playerRequests, 1);
});

test("keeps player identity provenance scoped to each draft season", async () => {
  const requests: Array<{ season: number; header: string | null }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const season = Number(url.pathname.match(/seasons\/(\d+)/)?.[1]);
    if (url.searchParams.get("view") === "mDraftDetail") {
      return Response.json(draftPayload(season, [picks[0]]));
    }
    requests.push({ season, header: new Headers(init?.headers).get("x-sentinel") });
    return Response.json({
      players: [{
        player: {
          id: 10,
          fullName: `Fixture ${season}`,
          defaultPositionId: season === 2018 ? 1 : 2,
        },
      }],
    });
  };

  const rows = await fetchDraftHistory({
    leagueId: "123",
    seasons: [2018, 2026],
    headers: new Headers([["x-sentinel", "present"]]),
    fetcher,
  });

  assert.deepEqual(requests, [
    { season: 2018, header: "present" },
    { season: 2026, header: "present" },
  ]);
  assert.deepEqual(
    rows.map((row) => ({
      season: row.season,
      name: row.player.displayName,
      position: row.player.defaultPositionId,
      sourceSeason: row.player.source.season,
    })),
    [
      { season: 2018, name: "Fixture 2018", position: 1, sourceSeason: 2018 },
      { season: 2026, name: "Fixture 2026", position: 2, sourceSeason: 2026 },
    ],
  );

  const reverseRows = await fetchDraftHistory({
    leagueId: "123",
    seasons: [2026, 2018],
    headers: { "x-sentinel": "present" },
    fetcher,
  });
  assert.deepEqual(
    reverseRows.map((row) => [row.season, row.player.displayName, row.player.defaultPositionId]),
    [[2026, "Fixture 2026", 2], [2018, "Fixture 2018", 1]],
  );
});

test("preserves supported header forms for player resolution", async () => {
  const headerForms: HeadersInit[] = [
    { "x-sentinel": "record" },
    [["x-sentinel", "tuples"]],
    new Headers([["x-sentinel", "headers"]]),
  ];

  for (const headers of headerForms) {
    let playerHeader: string | null = null;
    await fetchDraftHistory({
      leagueId: "123",
      seasons: [2026],
      headers,
      fetcher: async (input, init) => {
        const url = new URL(String(input));
        if (url.searchParams.get("view") === "mDraftDetail") {
          return Response.json(draftPayload(2026, [picks[0]]));
        }
        playerHeader = new Headers(init?.headers).get("x-sentinel");
        return Response.json(playerPayload([10]));
      },
    });
    assert.equal(playerHeader, new Headers(headers).get("x-sentinel"));
  }
});

function draftRows(season: number, picksForSeason: Pick[]) {
  return picksForSeason.map((pick) => ({
    leagueId: "123",
    season,
    teamId: String(pick.teamId),
    espnPlayerId: pick.playerId,
    round: pick.roundId,
    roundPick: pick.roundPickNumber,
    overallPick: pick.overallPickNumber,
    source: {
      source: "espn:mDraftDetail" as const,
      season,
      sourceChecksum: "a".repeat(64),
      observedAt: `${season}-09-01T00:00:00.000Z`,
      evidenceStatus: "confirmed" as const,
    },
    player: {
      espnPlayerId: pick.playerId,
      displayName: `Fixture ${season} ${pick.playerId}`,
      defaultPositionId: pick.playerId < 0 ? 16 : 1,
      source: {
        source: "espn:kona_player_info" as const,
        season,
        sourceChecksum: "b".repeat(64),
        observedAt: `${season}-09-01T00:00:00.000Z`,
        evidenceStatus: "confirmed" as const,
      },
    },
  }));
}

function draftStore() {
  const players = new Map<number, Record<string, unknown>>();
  const draftPicks = new Map<string, Record<string, unknown>>();
  return {
    players,
    draftPicks,
    rpc: async (_name: string, args: Record<string, unknown>) => {
      for (const row of args.p_players as Record<string, unknown>[]) {
        const existing = players.get(row.espn_player_id as number);
        const newest = !existing || Number(row.last_seen_season) >= Number(existing.last_seen_season);
        players.set(row.espn_player_id as number, {
          ...(existing ?? {}),
          ...(newest ? row : {}),
          first_seen_season: Math.min(Number(existing?.first_seen_season ?? row.first_seen_season), Number(row.first_seen_season)),
          last_seen_season: Math.max(Number(existing?.last_seen_season ?? row.last_seen_season), Number(row.last_seen_season)),
        });
      }
      const rows = args.p_picks as Record<string, unknown>[];
      for (const [key, row] of draftPicks) {
        if (row.league_id === rows[0]?.league_id && row.season === rows[0]?.season) draftPicks.delete(key);
      }
      for (const row of rows) {
        draftPicks.set(`${row.league_id}:${row.season}:${row.overall_pick}`, row);
      }
      return { error: null };
    },
  };
}

test("replaces complete draft seasons, preserves player chronology, and supports reverse imports", async () => {
  const store = draftStore();
  const first = draftRows(2018, [picks[0], picks[1]]);
  const latest = draftRows(2026, [picks[0], { ...picks[1], overallPickNumber: 3, roundPickNumber: 3 }]);
  const result = await persistDraftHistory(store as never, [...latest, ...first], { expectedPickCount: 2 });
  assert.deepEqual(result, { players: 2, picks: 4, seasons: 2 });
  assert.equal(store.players.get(10)?.first_seen_season, 2018);
  assert.equal(store.players.get(10)?.last_seen_season, 2026);
  assert.equal(store.players.get(10)?.display_name, "Fixture 2026 10");
  assert.equal(store.draftPicks.size, 4);

  await persistDraftHistory(store as never, draftRows(2026, [picks[0], picks[1]]), { expectedPickCount: 2 });
  assert.deepEqual(
    [...store.draftPicks.values()]
      .filter((row) => row.season === 2026)
      .map((row) => row.overall_pick)
      .sort(),
    [1, 2],
  );
});

test("rejects incomplete seasons before issuing writes", async () => {
  const store = draftStore();
  await assert.rejects(
    persistDraftHistory(store as never, draftRows(2026, [picks[0]]), { expectedPickCount: 2 }),
    /incomplete season/,
  );
  assert.equal(store.players.size, 0);
  assert.equal(store.draftPicks.size, 0);
});
