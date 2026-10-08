import "server-only";
import { timingSafeEqual } from "node:crypto";
import {
  syncCurrentSeason,
  type EspnSyncResult,
} from "./index";

const responseHeaders = { "Cache-Control": "private, no-store" };

function matchesBearerToken(request: Request, secret: string) {
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return (
    supplied.length === expected.length && timingSafeEqual(supplied, expected)
  );
}

export function createEspnSyncHandler(options: {
  cronSecret: string | undefined;
  sync: () => Promise<EspnSyncResult>;
}) {
  return async function handleEspnSync(request: Request) {
    const secret = options.cronSecret?.trim();
    if (!secret) {
      return Response.json(
        { error: "Sync service is not configured." },
        { status: 500, headers: responseHeaders },
      );
    }
    if (!matchesBearerToken(request, secret)) {
      return Response.json(
        { error: "Unauthorized." },
        {
          status: 401,
          headers: { ...responseHeaders, "WWW-Authenticate": "Bearer" },
        },
      );
    }
    try {
      return Response.json(await options.sync(), { headers: responseHeaders });
    } catch {
      return Response.json(
        { error: "ESPN synchronization failed." },
        { status: 500, headers: responseHeaders },
      );
    }
  };
}

export function handleEspnSyncRequest(request: Request) {
  return createEspnSyncHandler({
    cronSecret: process.env.CRON_SECRET,
    sync: syncCurrentSeason,
  })(request);
}
