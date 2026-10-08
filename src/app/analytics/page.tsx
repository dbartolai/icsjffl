import type { Metadata } from "next";
import {
  AnalyticsDashboard,
  AnalyticsEmptyState,
} from "@/components/analytics/AnalyticsDashboard";
import { getLeagueAnalytics } from "@/lib/analytics/load";

export const metadata: Metadata = {
  title: "Analytics",
  description:
    "ICSJ FFL expected wins, schedule luck, scoring context, and rivalry analytics.",
};

export const dynamic = "force-dynamic";

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string | string[] }>;
}) {
  const rawSeason = (await searchParams).season;
  const parsedSeason = typeof rawSeason === "string" ? Number(rawSeason) : NaN;
  const requestedSeason =
    rawSeason === undefined
      ? 2026
      : Number.isInteger(parsedSeason)
        ? parsedSeason
        : null;
  const data = await getLeagueAnalytics(requestedSeason);
  return data ? <AnalyticsDashboard data={data} /> : <AnalyticsEmptyState />;
}
