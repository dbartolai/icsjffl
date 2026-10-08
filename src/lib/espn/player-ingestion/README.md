# Current player ingestion

`fetchCurrentPlayerImport` retrieves the active season's transaction feed before
weekly roster calls, then validates every expected team and scoring period. It
returns normalized data only. `persistCurrentPlayerImport` writes those records
with period coverage held unavailable until the replacement succeeds.

`importCurrentPlayerSeason` composes both steps. Call it without a Supabase
client to validate and count a dry run.

`importHistoricalPlayerSeason` imports a selected 2018 through 2025 season or
week range. It uses only direct `mRoster` and `mBoxscore` responses. Roster,
lineup, actual-score, and projection coverage remain separate. Historical
injury, eligibility, and lineup-rule values are suppressed because current
payload shapes do not prove those values were valid for that period. The import
does not request or create historical transactions. A 2017 selection returns
an explicit unavailable marker and writes no weekly rows.

The importer does not request 2017, does not request periods after ESPN's
reported latest scoring period, and does not turn roster changes into
transactions. Unknown provider transaction codes remain unverified.
