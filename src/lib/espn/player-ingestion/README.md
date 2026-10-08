# Current player ingestion

`fetchCurrentPlayerImport` retrieves the active season's transaction feed before
weekly roster calls, then validates every expected team and scoring period. It
returns normalized data only. `persistCurrentPlayerImport` writes those records
with period coverage held unavailable until the replacement succeeds.

`importCurrentPlayerSeason` composes both steps. Call it without a Supabase
client to validate and count a dry run. Historical weekly work can reuse the
normalizer and store, but must choose only directly supported scoring periods.

The importer does not request 2017, does not request periods after ESPN's
reported latest scoring period, and does not turn roster changes into
transactions. Unknown provider transaction codes remain unverified.
