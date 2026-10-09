export const ICSJFFL_PRODUCTION_PROJECT_REF = "kolfqdrpssngbineozjd";

export type ImportTarget =
  | { mode: "dry-run" }
  | { mode: "local" | "production"; url: string };

type ImportTargetOptions = {
  apply: boolean;
  applyProduction: boolean;
  expectedProjectRef?: string;
  supabaseUrl: string;
};

export type ImportTargetFlags = {
  apply: boolean;
  applyProduction: boolean;
  expectedProjectRef?: string;
};

export function parseImportTargetFlags(args: readonly string[]): ImportTargetFlags {
  let apply = false;
  let applyProduction = false;
  let expectedProjectRef: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--apply") {
      if (apply) throw new Error("--apply may only be passed once.");
      apply = true;
    } else if (argument === "--apply-production") {
      if (applyProduction) throw new Error("--apply-production may only be passed once.");
      applyProduction = true;
    } else if (argument === "--expected-project-ref") {
      if (expectedProjectRef !== undefined) throw new Error("--expected-project-ref may only be passed once.");
      const value = args[++index];
      if (!value || value.startsWith("--")) {
        throw new Error("--expected-project-ref requires one value.");
      }
      expectedProjectRef = value;
    } else {
      throw new Error("Use --apply for local writes, or --apply-production --expected-project-ref kolfqdrpssngbineozjd.");
    }
  }

  return { apply, applyProduction, expectedProjectRef };
}

function parseUrl(value: string) {
  try {
    return new URL(value);
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must be a valid URL.");
  }
}

export function resolveImportTarget({
  apply,
  applyProduction,
  expectedProjectRef,
  supabaseUrl,
}: ImportTargetOptions): ImportTarget {
  if (apply && applyProduction) {
    throw new Error("Choose either --apply for a local database or --apply-production, not both.");
  }
  if (!apply && !applyProduction) {
    if (expectedProjectRef) throw new Error("--expected-project-ref requires --apply-production.");
    return { mode: "dry-run" };
  }

  const url = parseUrl(supabaseUrl);
  if (apply) {
    if (!new Set(["localhost", "127.0.0.1", "::1"]).has(url.hostname)) {
      throw new Error("--apply only writes to a local Supabase database.");
    }
    return { mode: "local", url: url.toString() };
  }

  if (expectedProjectRef !== ICSJFFL_PRODUCTION_PROJECT_REF) {
    throw new Error(`--apply-production requires --expected-project-ref ${ICSJFFL_PRODUCTION_PROJECT_REF}.`);
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== `${ICSJFFL_PRODUCTION_PROJECT_REF}.supabase.co` ||
    url.port ||
    url.username ||
    url.password ||
    !["", "/"].includes(url.pathname)
  ) {
    throw new Error("--apply-production only writes to the configured ICSJFFL Supabase project.");
  }
  return { mode: "production", url: url.toString() };
}
