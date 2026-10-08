# Injury and bench model evidence

This report narrows the supported scope for injury and bench-impact analysis.
It uses read-only probes run on October 8, 2026. No response body, player
name, cookie, roster, or production data was saved.

## Evidence matrix

| Periods | Period-specific lineup and points | Eligibility and lineup rules | Injury evidence and timing | Model decision |
| --- | --- | --- | --- | --- |
| 2017, periods 1-19 | Unavailable. ESPN repeated one roster snapshot for all 19 requests and returned no box-score rosters. | Unavailable. A repeated snapshot cannot date eligibility or rules. | Unavailable for timing. The repeated injury fields are not weekly observations. | No starter, bench, injury, or ownership model. |
| 2018 | ESPN returned a roster response for 18/18 requested periods and a box-score roster with actual scores for 15/18. The three remaining periods are not suitable for bench-impact math. | Historical importer suppresses these fields. No retained period-specific rule configuration was established. | Injury fields appeared in 18/18 roster responses, but ESPN gives no retained observation time. | Candidate for a future lineup-only model only after each imported period passes its complete-response checks. No injury model. |
| 2019 | 18/18 roster, 15/18 box-score with actual scores. | Same historical gap. | Fields in 18/18, no timing evidence. | Same boundary. |
| 2020 | 18/18 roster, 15/18 box-score with actual scores. | Same historical gap. | Fields in 18/18, no timing evidence. | Same boundary. |
| 2021-2025 | Each season returned a roster response for every requested period. Direct box-score periods were 16/19 in each season. | Same historical gap. | Fields appeared in every requested roster response, but do not establish when a designation was known. | Same boundary. |
| 2026 through period 5 | Current dry run returned 5/5 periods with direct roster, lineup, and actual-score coverage. It returned projections for 3/5. | Current importer can validate eligibility from each current response. It only records the current lineup-rule configuration on the latest period. | The same response has an injury field, marked `unverified`. It is an observation at probe time, not a pregame or in-game timeline. | Forward lineup coverage can start now. Injury and bench-impact models remain blocked. |

The historical counts came from `scripts/audit-espn-player-data.ts`. A direct
box-score count only shows that the audit found a box-score roster and actual
score. The importer still rejects a period that does not contain complete
roster and score evidence. That failure is intentional.

## Crosswalk result

Run the bounded, aggregate-only crosswalk probe with:

```bash
node --env-file=.env.local --import tsx scripts/audit-injury-crosswalk.ts
```

The October 8 run observed 800 injury rows with exactly one validated ESPN
profile link and 800 unique profile IDs. It selected the first 40 unique IDs
in provider order, then made two 20-ID `kona_player_info` requests. ESPN
returned 18 records for their requested IDs. All 18 had the same ID and exact
display-name/full-name match. The remaining 22 IDs were each retried in a
one-ID request. ESPN returned none of them.

That result has a clear denominator: 18 exact matches out of 40 selected IDs,
not out of the 800-ID injury response. It does not explain why 22 IDs were
omitted. The endpoint may exclude a player from this fantasy-league view,
apply a filter behavior that is not documented, or have another provider-side
constraint. The single-ID retries rule out only a batch-size omission for this
sample. They do not establish a population crosswalk.

The injury feed is a current, mutable ESPN response. It has no historical
archive in this audit and does not preserve the time a designation became
known. The player query is also a current 2026 fantasy response. A match today
does not prove the same mapping or injury status at a past lineup lock.

## Minimum supported scope

The safe MVP is a forward-only lineup evidence collector for 2026. It may
store a period only when the importer sees a complete direct roster and
box-score response. It may show starter and bench membership plus actual
points for that captured period. It must label a missing period unavailable,
not fill it from a neighboring roster.

Do not add an injury-luck, injury-caused bench, or historical eligibility
model. Those need all of the following first:

- A written-permission or licensed source for official practice and game-status
  reports, captured with provider timestamps before lineup locks and after
  material updates.
- A versioned player crosswalk with measured population coverage. Name-only
  matches are not enough.
- A policy for in-game injuries, late inactive reports, corrections, and
  actual participation.
- Historical lineup-rule and eligibility observations for any historical week
  shown in a bench-impact result.

The source and licensing limits are recorded in
[the injury source audit](./injury-data-audit.md). The period-level ESPN limits
are recorded in [the player data audit](./espn-player-data-audit.md).
