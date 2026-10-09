import assert from "node:assert/strict";
import { test } from "node:test";
import { auditInjuryCrosswalk } from "../scripts/audit-injury-crosswalk";

test("reports aggregate crosswalk results and retries only unresolved IDs", async () => {
  const playerRequests: number[][] = [];
  const fetchImpl = (async (input, init) => {
    const url = String(input);
    if (url.includes("site.api.espn.com")) {
      return new Response(JSON.stringify({
        injuries: [{ injuries: [
          { athlete: { displayName: "Alpha", links: [{ href: "https://www.espn.com/nfl/player/_/id/1/alpha" }] } },
          { athlete: { displayName: "Bravo", links: [{ href: "https://www.espn.com/nfl/player/_/id/2/bravo" }] } },
          { athlete: { displayName: "Charlie", links: [{ href: "https://www.espn.com/nfl/player/_/id/3/charlie" }] } },
          { athlete: { displayName: "Alpha", links: [{ href: "https://www.espn.com/nfl/player/_/id/1/alpha" }] } },
        ] }],
      }), { status: 200 });
    }
    const filter = JSON.parse(new Headers(init?.headers).get("x-fantasy-filter") ?? "{}");
    const ids = filter.players.filterIds.value as number[];
    playerRequests.push(ids);
    const players = ids.filter((id) => id !== 3).map((id) => ({
      player: { id, fullName: id === 2 ? "Different Bravo" : "Alpha" },
    }));
    return new Response(JSON.stringify({ players }), { status: 200 });
  }) as typeof fetch;

  const result = await auditInjuryCrosswalk({
    fetchImpl,
    leagueId: "123",
    sampleSize: 3,
    batchSize: 2,
  });

  assert.deepEqual(playerRequests, [[1, 2], [3], [3]]);
  assert.deepEqual({ ...result, checkedAt: "redacted" }, {
    checkedAt: "redacted",
    season: 2026,
    injuryRowsWithOneProfileLinkId: 4,
    uniqueProfileLinkIds: 3,
    sampleRequested: 3,
    sampleLimit: 3,
    batchSize: 2,
    playerRecordsReturnedForRequestedIds: 2,
    exactIdAndNameMatches: 1,
    returnedIdsWithDifferentName: 1,
    unresolvedAfterBatch: 1,
    unresolvedReturnedOnIndividualRetry: 0,
    unresolvedAfterIndividualRetry: 1,
  });
  assert.equal(JSON.stringify(result).includes("Alpha"), false);
});
