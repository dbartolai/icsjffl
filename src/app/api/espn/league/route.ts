import { getLeagueData } from "@/lib/league";
import { EspnError } from "@/lib/espn/client";

export const dynamic = "force-dynamic";

export async function GET() {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    return Response.json(await getLeagueData(), { headers });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof EspnError
            ? error.message
            : "Unable to load the league.",
      },
      { status: 502, headers },
    );
  }
}
