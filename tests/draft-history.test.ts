import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fetchDraftHistory,
  previewDraftHistory,
} from "../src/lib/espn/draft-history";

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
    seasons: [2017, 2018],
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
