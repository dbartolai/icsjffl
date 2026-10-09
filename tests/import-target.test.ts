import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ICSJFFL_PRODUCTION_PROJECT_REF,
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
