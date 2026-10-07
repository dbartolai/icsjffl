import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { normalizeLeague } from "../src/lib/espn/normalize";
import { fetchEspnLeague } from "../src/lib/espn/client";
import { getLeagueData } from "../src/lib/league";
import { GET } from "../src/app/api/espn/league/route";
import { getSupabaseClient } from "../src/lib/supabase/client";

const response = {
  id: 123,
  seasonId: 2026,
  scoringPeriodId: 4,
  settings: {
    name: "Test league",
    scheduleSettings: { matchupPeriods: { "4": [4] } },
  },
  status: { currentMatchupPeriod: 4 },
  members: [
    { id: "owner", displayName: "Test manager", secret: "not exposed" },
  ],
  teams: [
    {
      id: 1,
      name: "First team",
      owners: ["owner"],
      playoffSeed: 2,
      record: {
        overall: {
          wins: 1,
          losses: 2,
          ties: 0,
          pointsFor: 320.5,
          pointsAgainst: 340,
        },
      },
      roster: {
        entries: [
          {
            playerPoolEntry: {
              player: {
                id: 44,
                fullName: "Test Player",
                defaultPositionId: 1,
                proTeamId: 3,
              },
            },
          },
        ],
      },
    },
    {
      id: 2,
      location: "Second",
      nickname: "team",
      playoffSeed: 1,
      record: {
        overall: { wins: 2, losses: 1, pointsFor: 340, pointsAgainst: 320.5 },
      },
    },
  ],
  schedule: [
    {
      id: 10,
      matchupPeriodId: 3,
      home: { teamId: 1, totalPoints: 80 },
      away: { teamId: 2, totalPoints: 90 },
    },
    {
      id: 11,
      matchupPeriodId: 4,
      home: { teamId: 1, totalPoints: 101.5 },
      away: { teamId: 2, totalPoints: 0 },
    },
  ],
};
const originalFetch = global.fetch;
const envNames = [
  "ESPN_LEAGUE_ID",
  "ESPN_S2",
  "ESPN_SWID",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
];
const originalEnv = Object.fromEntries(
  envNames.map((name) => [name, process.env[name]]),
);
afterEach(() => {
  global.fetch = originalFetch;
  for (const name of envNames) {
    if (originalEnv[name] === undefined) delete process.env[name];
    else process.env[name] = originalEnv[name];
  }
});
function configure() {
  process.env.ESPN_LEAGUE_ID = "123";
  delete process.env.ESPN_S2;
  delete process.env.ESPN_SWID;
}

test("normalizes owners, players, standings, records and only current matchups", () => {
  const league = normalizeLeague(response);
  assert.equal(league.teams[0].name, "Second team");
  assert.equal(league.teams[1].manager, "Test manager");
  assert.equal(league.teams[1].roster[0].position, "QB");
  assert.equal(league.teams[1].pointsAgainst, 340);
  assert.equal(league.matchups.length, 1);
  assert.equal(league.matchups[0].awayScore, 0);
  assert.equal(JSON.stringify(league).includes("secret"), false);
  assert.equal(JSON.stringify(league).includes("playerPoolEntry"), false);
});

test("handles pre-draft teams, missing records, unknown owners and bye weeks", () => {
  const league = normalizeLeague({
    ...response,
    teams: [{ id: 1 }],
    schedule: [{ id: 1, matchupPeriodId: 4, home: { teamId: 1 } }],
  });
  assert.equal(league.teams[0].name, "Team 1");
  assert.equal(league.teams[0].wins, 0);
  assert.deepEqual(league.teams[0].roster, []);
  assert.equal(league.matchups[0].awayTeamId, null);
  assert.equal(league.matchups[0].homeScore, null);
});

test("uses weekly scores for multi-week playoff matchups, never aggregate totals", () => {
  const league = normalizeLeague({
    ...response,
    scoringPeriodId: 16,
    settings: {
      name: "Playoffs",
      scheduleSettings: { matchupPeriods: { "15": [15, 16] } },
    },
    schedule: [
      {
        id: 1,
        matchupPeriodId: 15,
        home: {
          teamId: 1,
          totalPoints: 250,
          pointsByScoringPeriod: { "16": 120 },
        },
        away: { teamId: 2, totalPoints: 240 },
      },
    ],
  });
  assert.equal(league.matchups[0].homeScore, 120);
  assert.equal(league.matchups[0].awayScore, null);
  assert.equal(league.matchups[0].week, 16);
});

test("rejects malformed upstream payloads", () => {
  assert.throws(() => normalizeLeague({ error: "Unauthorized" }));
  assert.throws(() =>
    normalizeLeague({ ...response, teams: [{ id: "wrong type" }] }),
  );
});

test("missing config uses labeled mock data without making requests", async () => {
  delete process.env.ESPN_LEAGUE_ID;
  global.fetch = async () => {
    throw new Error("Should not fetch");
  };
  const data = await getLeagueData();
  assert.equal(data.source, "mock");
  assert.equal(data.league.season, 2026);
  const result = await GET();
  assert.equal(result.status, 200);
  assert.equal((await result.json()).source, "mock");
});

test("requests the 2026 endpoint and all views with private cookies only on the server", async () => {
  configure();
  process.env.ESPN_S2 = "test-s2-value";
  process.env.ESPN_SWID = "{test-swid}";
  global.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(
      url.pathname,
      "/apis/v3/games/ffl/seasons/2026/segments/0/leagues/123",
    );
    assert.deepEqual(url.searchParams.getAll("view"), [
      "mTeam",
      "mRoster",
      "mStandings",
      "mMatchup",
      "mMatchupScore",
      "mSettings",
    ]);
    assert.equal(
      new Headers(init?.headers).get("Cookie"),
      "espn_s2=test-s2-value; SWID={test-swid}",
    );
    assert.equal(init?.cache, "no-store");
    assert.equal(init?.redirect, "error");
    assert.ok(init?.signal);
    return Response.json(response);
  };
  const result = await GET();
  const body = await result.text();
  assert.equal(result.status, 200);
  assert.equal(JSON.parse(body).source, "espn");
  assert.equal(body.includes("test-s2-value"), false);
  assert.equal(body.includes("test-swid"), false);
  assert.equal(result.headers.get("Cache-Control"), "private, no-store");
});

test("public leagues send no cookies", async () => {
  configure();
  global.fetch = async (_input, init) => {
    assert.equal(new Headers(init?.headers).has("Cookie"), false);
    return Response.json(response);
  };
  assert.equal((await getLeagueData()).source, "espn");
});

test("invalid IDs, incomplete cookies and cookie injection fail before fetching", async () => {
  configure();
  global.fetch = async () => {
    assert.fail("Should not fetch");
  };
  process.env.ESPN_LEAGUE_ID = "../123";
  await assert.rejects(fetchEspnLeague(), /numeric league ID/);
  process.env.ESPN_LEAGUE_ID = "123";
  process.env.ESPN_S2 = "only-one-cookie";
  await assert.rejects(fetchEspnLeague(), /both ESPN_S2 and ESPN_SWID/);
  process.env.ESPN_SWID = "bad;cookie";
  await assert.rejects(fetchEspnLeague(), /invalid format/);
});

test("upstream failures return safe errors and never fall back silently", async () => {
  configure();
  for (const status of [401, 403, 404, 429, 500]) {
    global.fetch = async () =>
      new Response("sensitive upstream body", { status });
    const result = await GET();
    assert.equal(result.status, 502);
    const body = await result.json();
    assert.ok(body.error);
    assert.equal(body.source, undefined);
    assert.equal(body.error.includes("sensitive"), false);
  }
  global.fetch = async () => {
    throw new DOMException("secret", "TimeoutError");
  };
  await assert.rejects(fetchEspnLeague(), /could not be reached/);
  global.fetch = async () => new Response("<html>Sign in</html>");
  await assert.rejects(fetchEspnLeague(), /unexpected league response/);
  global.fetch = async () => Response.json({ ...response, seasonId: 2025 });
  await assert.rejects(fetchEspnLeague(), /unexpected league response/);
});

test("Supabase is optional and does not require configuration at startup", () => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  assert.equal(getSupabaseClient(), null);
});
