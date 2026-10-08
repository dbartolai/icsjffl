import assert from "node:assert/strict";
import { test } from "node:test";
import { summarizeEspnInjuries } from "../scripts/audit-injury-data";

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
          { athlete: { displayName: "Another Synthetic Player" } },
        ],
      },
    ],
  });

  assert.deepEqual(result, {
    reportGroups: 1,
    injuryRows: 2,
    rowsWithDate: 1,
    rowsWithStatus: 1,
    rowsWithAthleteId: 1,
  });
  assert.equal(JSON.stringify(result).includes("Synthetic Player"), false);
});
