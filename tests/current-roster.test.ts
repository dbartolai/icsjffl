import assert from "node:assert/strict";
import test from "node:test";
import { currentRosterHref } from "../src/lib/current-roster";

test("builds a current-roster route without historical query parameters", () => {
  assert.equal(currentRosterHref("12"), "/players/teams/12");
  assert.equal(currentRosterHref("1/2"), "/players/teams/1%2F2");
});
