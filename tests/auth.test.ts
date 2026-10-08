import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAuthRedirectUrl,
  createInviteToken,
  hashInviteToken,
  safeNextPath,
} from "../src/lib/auth/invites";

test("invite tokens are random and only their digest is persisted", async () => {
  const first = createInviteToken();
  const second = createInviteToken();
  const digest = await hashInviteToken(first);

  assert.match(first, /^[0-9a-f]{64}$/);
  assert.match(digest, /^[0-9a-f]{64}$/);
  assert.notEqual(first, second);
  assert.notEqual(first, digest);
  assert.equal(await hashInviteToken(first), digest);
});

test("post-login redirects stay on this site", () => {
  assert.equal(safeNextPath("/invite?token=abc"), "/invite?token=abc");
  assert.equal(safeNextPath("https://attacker.example"), "/");
  assert.equal(safeNextPath("//attacker.example"), "/");
  assert.equal(safeNextPath("/\\attacker.example"), "/");
});

test("email confirmation uses the configured production origin", () => {
  assert.equal(
    buildAuthRedirectUrl(
      "/invite?token=abc",
      "http://localhost:3000",
      "https://icsjffl.example/path-is-ignored",
    ),
    "https://icsjffl.example/invite?token=abc",
  );
  assert.equal(
    buildAuthRedirectUrl(
      "https://attacker.example",
      "http://localhost:3000",
      "https://icsjffl.example",
    ),
    "https://icsjffl.example/",
  );
  assert.equal(
    buildAuthRedirectUrl("/invite", "http://localhost:3000", "not a url"),
    "http://localhost:3000/invite",
  );
});
