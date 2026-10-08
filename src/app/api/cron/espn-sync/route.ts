import { handleEspnSyncRequest } from "@/lib/espn/sync/handler";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  return handleEspnSyncRequest(request);
}
