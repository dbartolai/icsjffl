import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  ICSJFFL_PRODUCTION_PROJECT_REF,
  parseImportTargetFlags,
  resolveImportTarget,
} from "../src/lib/espn/import-target";

test("requires an explicit matching ICSJFFL project ref for production imports", () => {
  assert.deepEqual(resolveImportTarget({
    apply: false,
    applyProduction: true,
    expectedProjectRef: ICSJFFL_PRODUCTION_PROJECT_REF,
    supabaseUrl: `https://${ICSJFFL_PRODUCTION_PROJECT_REF}.supabase.co`,
  }), {
    mode: "production",
    url: `https://${ICSJFFL_PRODUCTION_PROJECT_REF}.supabase.co/`,
  });
  assert.throws(() => resolveImportTarget({
    apply: false,
    applyProduction: true,
    expectedProjectRef: "wrong-project",
    supabaseUrl: `https://${ICSJFFL_PRODUCTION_PROJECT_REF}.supabase.co`,
  }), /requires --expected-project-ref/);
  assert.throws(() => resolveImportTarget({
    apply: false,
    applyProduction: true,
    expectedProjectRef: ICSJFFL_PRODUCTION_PROJECT_REF,
    supabaseUrl: "https://example.supabase.co",
  }), /only writes to the configured ICSJFFL/);
});

test("preserves dry-run and local-only apply defaults", () => {
  assert.deepEqual(resolveImportTarget({
    apply: false,
    applyProduction: false,
    supabaseUrl: "https://example.supabase.co",
  }), { mode: "dry-run" });
  assert.deepEqual(resolveImportTarget({
    apply: true,
    applyProduction: false,
    supabaseUrl: "http://127.0.0.1:54321",
  }), { mode: "local", url: "http://127.0.0.1:54321/" });
  assert.throws(() => resolveImportTarget({
    apply: true,
    applyProduction: false,
    supabaseUrl: `https://${ICSJFFL_PRODUCTION_PROJECT_REF}.supabase.co`,
  }), /only writes to a local Supabase/);
});

test("parses production CLI flags without treating --apply as a project ref", () => {
  assert.deepEqual(parseImportTargetFlags([]), {
    apply: false,
    applyProduction: false,
    expectedProjectRef: undefined,
  });
  assert.deepEqual(parseImportTargetFlags(["--apply"]), {
    apply: true,
    applyProduction: false,
    expectedProjectRef: undefined,
  });
  assert.throws(
    () => parseImportTargetFlags(["--expected-project-ref"]),
    /requires one value/,
  );
  assert.throws(
    () => parseImportTargetFlags(["--expected-project-ref", "a", "--expected-project-ref", "b"]),
    /may only be passed once/,
  );
});

test("current and draft CLIs keep --apply on the local-only path", () => {
  for (const script of [
    "../scripts/import-current-players.ts",
    "../scripts/import-espn-drafts.ts",
  ]) {
    const result = spawnSync(
      process.execPath,
      ["--conditions=react-server", "--import", "tsx", fileURLToPath(new URL(script, import.meta.url)), "--apply"],
      {
        env: {
          ...process.env,
          NEXT_PUBLIC_SUPABASE_URL: "https://other-project.supabase.co",
        },
        encoding: "utf8",
      },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /--apply only writes to a local Supabase database/);
  }
});
