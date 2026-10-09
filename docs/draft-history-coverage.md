# Draft history preview

The draft preview reads only ESPN's `mDraftDetail` and `kona_player_info`
views for the audited 2017 through 2026 seasons. It does not write players,
draft picks, weekly entries, coverage rows, or transactions.

Run it with local server-only ESPN credentials:

```sh
node --conditions=react-server --env-file=.env.local --import tsx scripts/preview-espn-drafts.ts
```

The preview prints one count-only line per season. It expects the audited
ICSJFFL count of 160 picks per season, then reports a total of 1,600 picks.
That number is an audit baseline for this league, not a draft-size rule.

Each validated row carries the natural keys for `league_draft_picks`:
`league_id`, `season`, `overall_pick`, `round`, `round_pick`, and
`espn_player_id`, plus the draft team reference. It also carries resolved
player identity and separate source season, checksum, observation time, and
confirmed evidence metadata for the draft and player responses. Negative ESPN IDs are
valid and cover D/ST entries.

The module rejects duplicate overall picks, duplicate round picks, duplicate
players, malformed key values, missing player identities, conflicting player
identities, season mismatches, and an invalid legacy wrapper. It does not
print rows, player names, manager identifiers, cookies, or source payloads.

## Local persistence

After the league seasons and teams are available in a local Supabase instance,
run the importer with the primary checkout's environment file. It defaults to
a read-only dry run and accepts only a loopback Supabase URL with `--apply`.
Production persistence requires both an exact project URL and an explicit opt-in:

```sh
node --conditions=react-server \
  --env-file=/path/to/primary-checkout/.env.local \
  --import tsx scripts/import-espn-drafts.ts --apply-production \
  --expected-project-ref kolfqdrpssngbineozjd
```

The command rejects any other project ref or URL.

```sh
node --conditions=react-server \
  --env-file=/path/to/primary-checkout/.env.local \
  --import tsx scripts/import-espn-drafts.ts

node --conditions=react-server \
  --env-file=/path/to/primary-checkout/.env.local \
  --import tsx scripts/import-espn-drafts.ts --apply
```

The importer fetches and validates every season before it writes anything. A
season must have exactly 160 picks and unique draft natural keys. It replaces
the local season's picks, so a corrected ESPN response removes stale rows.
It upserts player identities first; the shared player-observation trigger
keeps the earliest and latest seasons and retains metadata from the newest
observation, even when imports arrive in reverse order.

This is draft-only work. It does not import weekly player entries,
transactions, coverage rows, or scheduler data.
