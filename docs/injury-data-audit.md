# Injury data source audit

This is a source decision for ICSJFFL's future redraft injury context. It does
not establish historical injury luck, write any production data, or authorize
an importer. The checked date is October 8, 2026.

Run the sanitized probe with:

```bash
node --import tsx scripts/audit-injury-data.ts
```

It makes one public ESPN request and four public nflverse `HEAD` requests. It
prints status codes, field counts, and response metadata only. It never writes
responses, player names, roster data, league data, cookies, or credentials.
For ESPN links, it accepts only HTTPS `www.espn.com` URLs whose path is
`/nfl/player/_/id/<numeric-id>`. It records aggregate counts for exactly one,
missing, conflicting, and malformed player-link IDs. It never follows a link
from the response.

## Decision

Do not build injury analytics or backfill injury claims now.

For forward capture, use a licensed or expressly permitted feed of the
official NFL club reports as the authoritative pregame source. Store each
response as observed, with its source timestamp and checksum. ESPN's current
public endpoint can be a display-only cross-check after a legal review. Do not
use it as the canonical feed because it is undocumented, mutable, and has no
verified historical archive. The current response does expose one parseable
ESPN player-profile ID per injury row, but that proves only field
extractability. It does not verify that the ID crosswalks to the fantasy player
records this project stores. nflverse is the practical historical research
input, not the forward source: its published data dictionary is useful and its
releases are public, but its schedule page reports a source interruption after
2024.

The NFL's published calendar requires practice reports and a game-status
report during game week, then updates after a material status change. That is
the timing a forward capture job must preserve. It does not make a public
archive or an automated collection license available. [NFL 2026 important
dates](https://operations.nfl.com/calendar-events/nfl-important-dates) and
[NFL terms](https://www.nfl.com/legal/terms/) should be reviewed with the
chosen provider agreement. NFL terms limit use to individual, non-commercial,
informational use and prohibit systematic collection without written consent.

## Provider and season coverage

`Confirmed` means the source documentation or the dated probe supports the
cell. It does not mean every player or every report was checked. `Unknown`
means this audit found no basis for the claim. `Unavailable` means the source
does not provide that kind of evidence.

| Source | 2017 | 2018-2024 | 2025 | 2026 forward | IDs and joins | Use and limits |
| --- | --- | --- | --- | --- | --- | --- |
| Official NFL club practice and game-status reports | Unknown public archive | Unknown public archive | Unknown public archive | Confirmed report schedule, access/licensing unresolved | Unknown stable public player ID | Best pregame designation and participation evidence if obtained through an authorized feed. The NFL schedule requires report filing and updates, but the public terms do not grant a collection license. |
| ESPN current NFL injuries endpoint | Unavailable historical archive | Unavailable historical archive | Unavailable historical archive | Confirmed current response only | Direct `athlete.id`: 0/800. Validated player-profile link ID: 800/800, with 0 conflicts and 0 malformed candidates. This is extractability, not verified crosswalk coverage. | Current status and date fields observed. Endpoint is undocumented, its terms/license for this use are unverified, and no forward retention guarantee was found. |
| nflverse injury releases | Confirmed reachable release | Confirmed reachable releases by documented range | Reachable release observed, provenance and completeness unresolved | Not suitable as the timely source | Confirmed `gsis_id`; later mapping to ESPN must be versioned and verified | Practical historical research source. Data dictionary exposes report and practice status. Project documentation says data are available from 2009 and releases are public. Its schedule page also says the source died after 2024, so do not treat 2025 or forward coverage as guaranteed. |

### Dated sources and probes

- [NFL 2026 important dates](https://operations.nfl.com/calendar-events/nfl-important-dates), accessed October 8, 2026. It states the game-week filing schedule and that status changes require updates.
- [NFL terms](https://www.nfl.com/legal/terms/), accessed October 8, 2026. It says the service is for individual, non-commercial, informational use and prohibits systematic data collection without prior written consent.
- [ESPN current injuries response](https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries), probed October 8, 2026. It returned HTTP 200 with 32 report groups and 800 injury rows, all with a date and status. It had zero direct `athlete.id` values. All 800 rows instead had exactly one ID from a validated ESPN player-profile link, with zero conflicting IDs and zero malformed profile-link candidates. The probe did not follow those links. It is not an ESPN-documented data contract.
- [nflverse injury loader](https://github.com/nflverse/nflreadr/blob/main/R/load_injuries.R), accessed October 8, 2026. It documents data availability since 2009 and the season release URL pattern.
- [nflverse injury dictionary](https://nflreadr.nflverse.com/articles/dictionary_injuries.html), accessed October 8, 2026. It documents `gsis_id`, report injuries/status, practice injuries/status, and `date_modified`.
- [nflverse availability schedule](https://nflreadr.nflverse.com/articles/nflverse_data_schedule.html), accessed October 8, 2026. It says injury data were updated daily at 07:00 UTC, but also says the upstream source stopped after 2024 and gives no 2025 ETA. This conflicts with the public 2025 asset below.
- The sanitized probe made `HEAD` requests for `injuries_2009.csv`, `injuries_2017.csv`, `injuries_2018.csv`, and `injuries_2025.csv` at the [nflverse release URL pattern](https://github.com/nflverse/nflverse-data/releases/download/injuries/injuries_2025.csv). Each returned HTTP 200. The 2025 asset reported `Last-Modified: Mon, 07 Sep 2026 12:23:41 GMT`. A reachable asset is not a completeness guarantee.
- [nflverse-data license](https://github.com/nflverse/nflverse-data/blob/main/LICENSE.md), accessed October 8, 2026. It is CC BY 4.0. Preserve attribution and validate that upstream-source rights cover the intended use before shipping derived data.

## What each signal proves

| Signal | Can support | Cannot support |
| --- | --- | --- |
| Official practice and game-status report | Pregame availability designation, practice participation, listed injury, observed-at timestamp | In-game injury onset, actual snaps, actual fantasy impact, or an omitted player's health |
| ESPN current injury status and validated player-profile link | Current provider status and an extractable ESPN profile ID at capture time | Historical status, a verified crosswalk to this league's fantasy player IDs, injury onset, or a forward snapshot that was not captured |
| nflverse report row | Historical report and practice fields described by its dictionary | A complete current-season feed, intraday timing, in-game injury, missed game, or ICSJFFL roster ownership |
| Game participation and completed lineup data | Whether a player appeared and the result of a lineup decision | The medical reason for absence without a separate injury source |

Pregame availability and missed-game evidence are different facts. An in-game
injury can occur after a player starts and will not be captured by the prior
game-status report. A designation can also clear before kickoff. Any future
model must join time-bounded injury observations to confirmed roster ownership
and complete lineup evidence. It must publish separate conservative, expected,
and optimistic assumptions. This project does not have complete 2017 weekly
lineups, and ESPN field presence from 2018 onward does not validate historical
injury designations. See [the ESPN player data audit](./espn-player-data-audit.md).

## Minimum forward capture contract

Do not add a migration in this task. A future narrow ingestion task needs, at
minimum:

- provider and provider record ID, provider version or URL, `observed_at`,
  provider-published time when available, raw-response checksum, and an
  explicit coverage status;
- external player ID and source team, with a versioned mapping to the existing
  ESPN fantasy player ID. Treat the current injury-link ID as extractable
  source evidence until the mapping is verified. Reject ambiguous name-only
  matches;
- season, NFL week, game ID when available, report kind (`practice` or
  `game_status`), designation, practice participation, primary and secondary
  injury text, and correction or supersession link;
- a snapshot schedule that captures every published report and a final update
  after the 90-minute inactive deadline. Retain the original observation and
  mark later provider corrections rather than overwriting it; and
- source attribution and the provider's permitted-use record.

## Narrow next task

After written permission or a suitable licensed feed is selected, build only a
server-side forward snapshot collector for the 2026 season. It should write
the contract above into a dedicated local test database, record coverage even
when a report is absent, and prove duplicate delivery is idempotent. It should
not join historical lineups, calculate injury luck, backfill 2017, or change
the current player importer.

## Still blocked

- A permitted, stable source for automated official-report collection.
- A verified crosswalk from injury-link IDs to the ESPN fantasy player IDs in
  this project. The isolated audit did not have league credentials to perform
  a read-only sample comparison, so it does not claim crosswalk coverage.
- Complete confirmed weekly lineup and ownership evidence for every season to
  be modeled.
- A policy for classifying in-game injuries and actual missed-game evidence.
