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
player identity and separate source checksum, observation time, and confirmed
evidence metadata for the draft and player responses. Negative ESPN IDs are
valid and cover D/ST entries.

The module rejects duplicate overall picks, duplicate round picks, duplicate
players, malformed key values, missing player identities, conflicting player
identities, season mismatches, and an invalid legacy wrapper. It does not
print rows, player names, manager identifiers, cookies, or source payloads.

Actual database backfill starts after the current-ingestion shared identity
writer lands. This preview checks the historical source mapping without
depending on that unmerged writer or reconstructing any weekly data.
