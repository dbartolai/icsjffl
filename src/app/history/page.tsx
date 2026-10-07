import type { Metadata } from "next";
import {
  RecordBookView,
} from "@/components/record-book/RecordBookView";
import { HISTORY_SEASONS } from "@/lib/espn/history";
import { getRecordBookData } from "@/lib/record-book";

export const metadata: Metadata = {
  title: "Record Book",
  description: "All-time ICSJ FFL records, leaders, and season history.",
};

export const dynamic = "force-dynamic";

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string | string[] }>;
}) {
  const rawSeason = (await searchParams).season;
  const parsedSeason = typeof rawSeason === "string" ? Number(rawSeason) : NaN;
  const selectedSeason = HISTORY_SEASONS.includes(parsedSeason)
    ? parsedSeason
    : null;
  const data = await getRecordBookData(selectedSeason);
  return <RecordBookView data={data} />;
}
