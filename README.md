# ICSJ FFL

A minimal fantasy football league dashboard built with Next.js App Router, TypeScript, Tailwind CSS, ESLint, and an optional Supabase client. Reads the **2026 ESPN Fantasy Football season**. No database is required to run it.

## Run locally

Use Node.js 22 or newer and npm.

```sh
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. With no league ID, the homepage and API return a clearly labeled fictional league. The dashboard includes standings, records (W–L–T), points for/against, teams, and current-week matchups. Mock roster arrays are intentionally empty.

## Connect ESPN

Set these values in `.env.local`, then restart the dev server:

```dotenv
ESPN_LEAGUE_ID=123456
ESPN_S2=
ESPN_SWID=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

- **League ID:** the numeric `leagueId` in your ESPN league URL. Public leagues only need this value.
- **Private leagues:** while signed in to ESPN in your browser, use Developer Tools → Application/Storage → Cookies to find `espn_s2` and `SWID`. Copy their values into `ESPN_S2` and `ESPN_SWID`. Keep SWID's braces and preserve the S2 value as copied; do not double-encode it. Supply both cookies together.
- ESPN credentials are read exclusively by a module guarded with `import "server-only"`. They are sent as server-side cookies and are never returned by the API or passed to components. Never prefix them with `NEXT_PUBLIC_`, commit them, or paste them into client code.
- No configured ID means mock mode. A configured ID with bad credentials, an unavailable season, a timeout, or an invalid upstream response produces an explicit error instead of mock data.
- The unofficial API may change, and your league must be available for 2026. Expired cookies may need replacing.

The client uses:

```text
https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/2026/segments/0/leagues/{leagueId}
```

Views: `mTeam`, `mRoster`, `mStandings`, `mMatchup`, `mMatchupScore`, `mSettings`. Each page load reads fresh data with a 10-second request timeout. There is no polling. Weekly scores use ESPN's scoring-period breakdown when available so multi-week playoff totals are not mislabeled as weekly scores; unavailable scores display an em dash.

## Supabase foundation

Optionally set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from your Supabase project. `getSupabaseClient()` lazily creates a client, or returns `null` when unconfigured. Nothing calls Supabase yet. No project provisioning, database schema, authentication, session persistence, or migrations are included. Use only the public anon key here, never a service-role key.

## Structure

```text
src/
  app/
    page.tsx                       Server-rendered dashboard
    layout.tsx                     Shared navigation and metadata
    globals.css                    Dark responsive theme + Tailwind
    loading.tsx                    Loading skeleton
    error.tsx                      Unexpected-error boundary
    api/espn/league/route.ts        Normalized JSON endpoint
  components/
    LeagueHeader.tsx
    StandingsTable.tsx
    MatchupCard.tsx
    TeamCard.tsx
  lib/
    league.ts                      Shared real/mock selection
    espn/
      client.ts                    Server-only ESPN HTTP reads
      normalize.ts                 ESPN → internal models
      types.ts                     Runtime validation + raw ESPN types
    fixtures/mock-league.ts        Fictional development fixture
    supabase/client.ts             Optional lazy client
  types/fantasy.ts                  League, team, player, matchup models
 tests/espn.test.ts                 Normalization and integration-boundary tests
```

Both the homepage and `GET /api/espn/league` use the same loader. The endpoint returns `{ source: "espn" | "mock", league: FantasyLeague }`; failures return HTTP 502 with `{ error: string }`. Responses are not publicly cached. Raw ESPN fields stay inside `lib/espn`.

This MVP has no authentication: anyone who can reach the app or its API can read its normalized league data, including team and manager names. Keep it local or behind deployment access controls until you intentionally want to share that data. ESPN cookie secrecy does not make dashboard data private.

## Checks

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

Tests cover normalization, sparse rosters, bye weeks, multi-week scoring, mock fallback, public/private requests, malformed responses, safe errors, and credential exclusion. They stub ESPN HTTP responses; they do not verify a real private league. A live verification requires your own league configuration.

## Scope and next step

No authentication, ESPN writes, trades, messages, trade block, database schema, or live polling. The next small feature is a **read-only team detail page** that displays the already-normalized roster.

References: [Next.js documentation](https://nextjs.org/docs/app), [Supabase JavaScript client](https://supabase.com/docs/reference/javascript/initializing).
