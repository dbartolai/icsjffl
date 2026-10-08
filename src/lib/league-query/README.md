# League history query contract

`queryLeagueHistory` is a pure, internal query function. It accepts normalized `HistoricalSeason` values and makes no network, database, auth, or model calls.

It answers only team-history questions: game score records, blowouts, head-to-head results, season standings, and a season summary built with the existing analytics calculator. Every returned fact carries a citation path that points to its stored season, team, and where needed game and week.

`teamId` means ESPN's franchise ID within the queried season. It does not identify a person. A manager-name request uses an exact case-insensitive match within that season and returns `resolution-needed` for unknown or ambiguous names.

The function returns `partialSeasons` for selected seasons without a champion. It does not answer player, lineup, transaction, or injury questions.
