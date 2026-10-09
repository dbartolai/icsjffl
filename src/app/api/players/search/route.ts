import { NextResponse } from "next/server";
import { searchPlayers } from "@/lib/player-history";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q") ?? "";
  const players = await searchPlayers(query);
  return NextResponse.json({ players }, {
    headers: { "Cache-Control": "no-store" },
  });
}
