import assert from "node:assert/strict";
import { test } from "node:test";
import {
  auditInjuryData,
  summarizeEspnInjuries,
} from "../scripts/audit-injury-data";

test("summarizes ESPN injury payloads without retaining player values", () => {
  const result = summarizeEspnInjuries({
    injuries: [
      {
        injuries: [
          {
            athlete: { displayName: "Synthetic Player", id: "42" },
            date: "2026-10-08T00:00:00Z",
            status: "Questionable",
          },
          {
            athlete: {
              displayName: "Another Synthetic Player",
              links: [
                {
                  href: "https://www.espn.com/nfl/player/_/id/4870808/example-player",
                },
                {
                  href: "https://www.espn.com/nfl/player/_/id/4870808/example-player",
                },
              ],
            },
          },
          {
            athlete: {
              links: [
                {
                  href: "https://www.espn.com/nfl/player/_/id/not-a-number/example-player",
                },
              ],
            },
          },
          {
            athlete: {
              links: [
                { href: "https://www.espn.com/nfl/player/_/id/1/first" },
                { href: "https://www.espn.com/nfl/player/_/id/2/second" },
              ],
            },
          },
          {
            athlete: {
              links: [
                {
                  href: "https://www.espn.com.attacker.example/nfl/player/_/id/3/spoofed",
                },
              ],
            },
          },
        ],
      },
    ],
  });

  assert.deepEqual(result, {
    reportGroups: 1,
    injuryRows: 5,
    rowsWithDate: 1,
    rowsWithStatus: 1,
    rowsWithDirectAthleteId: 1,
    rowsWithExactlyOneEspnAthleteLinkId: 1,
    rowsWithConflictingEspnAthleteLinkIds: 1,
    rowsWithNoEspnAthleteLinkId: 3,
    rowsWithMalformedAthleteLinkHref: 1,
  });
  assert.equal(JSON.stringify(result).includes("Synthetic Player"), false);
});

test("uses the injected fetch implementation for every audit request", async () => {
  const requests: Array<{ url: string; method: string | undefined }> = [];
  const fetchImpl = (async (input, init) => {
    const url = String(input);
    requests.push({ url, method: init?.method });
    if (url.includes("site.api.espn.com")) {
      return new Response(
        JSON.stringify({
          injuries: [
            {
              injuries: [
                {
                  athlete: {
                    links: [
                      {
                        href: "https://www.espn.com/nfl/player/_/id/4870808/example-player",
                      },
                    ],
                  },
                },
              ],
            },
          ],
        }),
        { status: 200 },
      );
    }
    return new Response(null, { status: 200 });
  }) as typeof fetch;

  const result = await auditInjuryData(fetchImpl);

  assert.equal(requests.length, 5);
  assert.equal(requests.filter(({ method }) => method === "HEAD").length, 4);
  assert.equal(result.espnCurrent.rowsWithExactlyOneEspnAthleteLinkId, 1);
  assert.equal(result.nflverseHistorical.every(({ reachable }) => reachable), true);
});
