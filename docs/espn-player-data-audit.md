# ESPN player data audit

This report records what ESPN returned for the ICSJFFL archive on October 8,
2026. The audit made read-only requests for 2017 through 2026. It saved no raw
responses, names, owner identifiers, or credentials.

Run the same sanitized check with:

```bash
npm run espn:audit-player-data
```

The command prints counts and field coverage. Pass `-- --json` for structured
output. It uses the server-only `ESPN_LEAGUE_ID`, `ESPN_S2`, and `ESPN_SWID`
values from `.env.local`.

## What the audit established

- ESPN resolved all 160 draft picks to player IDs and names in every season.
  Draft team, round, round pick, and overall pick are directly available.
- Scoring-period requests returned week-specific roster and lineup data for
  2018 through the current 2026 scoring period. Weekly box-score evidence
  covered the league's actual matchup weeks, including its playoff weeks.
- The 2017 legacy endpoint ignored the requested scoring period for player
  data. It repeated one roster and lineup snapshot 19 times and returned no
  weekly box-score rosters. The application must treat 2017 lineups, starter
  usage, bench points, and in-season ownership as unavailable.
- Historical transaction activity is not retained through the communication
  endpoint. Requests for 2018 through 2025 returned HTTP 404. The 2017 endpoint
  returned an empty feed. The active 2026 feed returned 309 topics and 607
  timestamped messages during the audit.
- Historical roster responses expose `acquisitionType` and `acquisitionDate`
  keys, but ESPN populated them only for the latest scoring-period snapshot.
  They cannot reconstruct old adds, drops, waivers, or trades.
- Weekly payloads include actual points, projected points, and injury status
  fields from 2018 onward. The audit confirms field availability, not the
  historical accuracy of injury designations.
- The league used only one scoring period per matchup period in every observed
  season. This league did not provide a live multi-week playoff case to test.

## Coverage by season

`Snapshots` is the number of distinct roster responses. `Actual weeks` counts
weeks with direct box-score roster evidence, not every NFL scoring period.

| Season | Endpoint | Weeks requested | Snapshots | Actual weeks | Projected weeks | Draft IDs resolved | Transaction feed |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 2017 | legacy `leagueHistory` | 19 | 1 | 0 | 0 | 160/160 | empty |
| 2018 | season | 18 | 18 | 15 | 17 | 160/160 | unavailable, HTTP 404 |
| 2019 | season | 18 | 16 | 15 | 17 | 160/160 | unavailable, HTTP 404 |
| 2020 | season | 18 | 18 | 15 | 17 | 160/160 | unavailable, HTTP 404 |
| 2021 | season | 19 | 18 | 16 | 18 | 160/160 | unavailable, HTTP 404 |
| 2022 | season | 19 | 19 | 16 | 18 | 160/160 | unavailable, HTTP 404 |
| 2023 | season | 19 | 18 | 16 | 18 | 160/160 | unavailable, HTTP 404 |
| 2024 | season | 19 | 17 | 16 | 18 | 160/160 | unavailable, HTTP 404 |
| 2025 | season | 19 | 17 | 16 | 18 | 160/160 | unavailable, HTTP 404 |
| 2026 | season | 5 | 5 | 5 | 5 | 160/160 | 309 current topics |

Injury status and numeric lineup slot fields appeared in every roster response.
For 2017 those fields came from the same repeated snapshot, so they do not
count as weekly evidence.

## Field and source map

| Data | ESPN source | Directly observed fields | Contract |
| --- | --- | --- | --- |
| Player identity | `kona_player_info` | player ID, full name, default position, eligible slots, NFL team ID | Confirmed for every drafted player in all ten seasons. Treat NFL team as season or week data, not permanent player identity. |
| Draft | `mDraftDetail` | team ID, player ID, round, round pick, overall pick | Confirmed for 2017 through 2026. |
| Weekly ownership | `mRoster` with `scoringPeriodId` | team ID, player ID | Confirmed for 2018 onward. A change between two weekly snapshots supports only an inferred ownership interval. |
| Weekly lineup | `mRoster` and `mBoxscore` with `scoringPeriodId` | numeric lineup slot ID | Confirmed only when the scoring period has direct box-score or distinct roster evidence. Read slot configuration from `settings.rosterSettings.lineupSlotCounts`; do not hardcode league positions. |
| Actual points | weekly `mBoxscore` | `playerPoolEntry.appliedStatTotal` | Confirmed for matchup weeks from 2018 onward. |
| Projected points | weekly player `stats` | scoring period ID, source ID 1, split type ID 1, applied total | Directly returned for 2018 onward. Keep the source IDs so future imports can reject a changed payload shape. |
| Injury designation | weekly player and roster fields | `injuryStatus`, `injured` | Field present for 2018 onward, but historical accuracy is unverified. Use an external source or forward snapshots before publishing injury-luck claims. |
| Acquisition metadata | `mRoster` | acquisition type and date | Populated only on the latest snapshot. Not a historical event source. |
| Transactions | `kona_league_communication` | topic/message IDs, message type codes, player targets, team/slot references, millisecond timestamps | Directly available for the active season only. Capture now; do not assume ESPN will retain it after rollover. |

## Rules for historical claims

These rules are part of the data contract, not UI copy.

1. Never reconstruct a starter, bench slot, or points-left-on-bench result from
   season totals, final rosters, acquisition metadata, or ownership deltas.
2. Store a coverage status for every season and scoring period. Suppress lineup
   analytics unless the weekly lineup status is `confirmed`.
3. A player changing teams between two direct weekly snapshots is an inferred
   ownership move. It is not a confirmed trade, waiver claim, add, or drop.
4. Do not create 2017 weekly lineup rows from the repeated legacy snapshot.
   Preserve it, if useful, as a season-final roster observation without a week.
5. Treat current ESPN responses as mutable. Save `observed_at` and a source
   checksum, refresh open weeks, and take a final capture after stat corrections.
   This one-day audit cannot prove that ESPN leaves prior snapshots unchanged.

## Minimum schema contract

The next migration should add only the records supported by the audit:

- `players`: canonical ESPN player ID, display name, default position, first
  seen season, and last seen season.
- `league_draft_picks`: league, season, team, player, round, round pick, and
  overall pick. The existing league-season-team key remains the team reference.
- `player_week_entries`: league, season, scoring period, team, player, lineup
  slot ID, actual points, projected points, injury designation, `observed_at`,
  and source checksum. Do not insert rows for a week without direct evidence.
- `player_data_coverage`: one row per league, season, and scoring period with
  separate roster, lineup, actual-score, projection, injury, and transaction
  statuses. At minimum the statuses need `confirmed`, `unverified`,
  `inferred`, and `unavailable`, plus a reason.
- `transactions` and `transaction_assets`: forward-captured ESPN event and
  asset identifiers, event time, raw provider type code, normalized type when
  verified, source, and evidence level. Do not label weekly roster deltas as
  transactions.

`player_week_entries` already describes an ownership interval well enough for
the first player-history page. A separate ownership-event table would duplicate
those facts and is not needed for the MVP.

## Next implementation boundary

Start the player schema and current-season importer from this contract. The
importer should capture the current transaction feed before ESPN rolls to the
next season, then store weekly rosters and box scores with coverage rows. A
historical backfill can safely import drafts and 2018 through 2025 weekly
lineups. It must present old ownership changes as inferred and leave 2017
lineup analytics disabled.

## Backfill reconciliation sample

On October 8, 2026, the historical importer made one read-only request for
2018 scoring period 1. ESPN returned one complete period with 159 roster
entries. The importer marked roster, lineup, actual-score, and projection
coverage confirmed. It left injury, eligibility, lineup-rule, and transaction
evidence unavailable. This is a bounded smoke check, not a claim that every
historical week is complete.
