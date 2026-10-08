# ICSJ FFL

A Next.js league hub for ICSJ fantasy football. The current MVP combines live ESPN standings and matchups with a ten-season Record Book covering 2017–2026.

## Run locally

Use Node.js 22 or newer.

```sh
npm install
cp .env.example .env.local
npm run dev
```

Open <http://localhost:3000>. Without an ESPN league ID, the homepage uses clearly labeled mock data. The Record Book requires ESPN history or an imported Supabase archive.

## Environment

```dotenv
ESPN_LEAGUE_ID=123456
ESPN_S2=
ESPN_SWID=

NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
```

- Private ESPN leagues require both `ESPN_S2` and `ESPN_SWID`. They remain server-only.
- The Supabase publishable key can only read the derived history tables.
- `SUPABASE_SECRET_KEY` is server-only and is used solely by the one-off import command. Never expose or commit it.

## Historical import

Apply the migration in `supabase/migrations` first, then verify ESPN coverage without writing:

```sh
npm run history:check
```

The current archive should report 10 seasons and 720 completed matchups. Import or refresh it with:

```sh
npm run history:import
```

The import is idempotent. It upserts public, derived season/team/game rows and stores one private normalized snapshot per season for future recalculation. The app reads Supabase first and falls back to ESPN while the archive is unavailable.

RLS is enabled on every history table. Derived history is publicly readable for this no-login MVP; ESPN snapshots remain service-role-only. When commissioner invites and authentication are added, replace the three public read policies with league-membership policies.

## Record Book

`/history` includes:

- highest single-game scores
- biggest blowouts
- most points in a loss
- lowest score in a win
- all-time franchise records and championships
- season champions and top scorers
- an all-time or single-season filter

ESPN team slot IDs are stable across the archive, so franchise totals survive team-name changes. Ownership changes will need a commissioner-maintained mapping in a later auth phase.

## Checks

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

The historical tests cover the legacy 2017 endpoint, weekly playoff-score expansion, future-game filtering, champions, records, franchise aggregation, and safe ESPN failures.

The [player-data audit](docs/espn-player-data-audit.md) records which draft,
weekly roster, lineup, scoring, injury, and transaction fields ESPN still
returns for 2017 through 2026. Run `npm run espn:audit-player-data` to repeat
the sanitized, read-only check.
