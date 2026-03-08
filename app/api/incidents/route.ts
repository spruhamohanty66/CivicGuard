import { NextResponse } from "next/server";
import type { Incident } from "@/lib/types";
import { calculateAIScore } from "@/lib/aiScore";

export const dynamic = "force-dynamic";

const DATASET_ID = "98cc-bc7d";
const APP_TOKEN = process.env.MONTGOMERY_APP_TOKEN;
const SODA_BASE = `https://data.montgomerycountymd.gov/resource/${DATASET_ID}.json`;

// Normalize a plain object row using known API field names
function normalizeObject(obj: Record<string, unknown>): Incident | null {
  const type = (obj.initial_type as string) || "Unknown Incident";
  const street = (obj.address as string) ?? "";
  const city = (obj.city as string) ?? "";
  const address = [street, city].filter(Boolean).join(", ") || "Address Unavailable";
  const startTimeRaw = (obj.start_time as string) ?? null;
  const priority = obj.priority !== undefined ? String(obj.priority) : undefined;

  if (!startTimeRaw) return null;

  const incidentId = String(
    (obj.incident_id as string) ??
    (obj.id as string) ??
    Math.random().toString(36).slice(2)
  );

  const startTime = startTimeRaw
    ? new Date(startTimeRaw).toISOString()
    : new Date().toISOString();

  const createdAtRaw =
    (obj.created_at as string) ??
    (obj[":created_at"] as string) ??
    null;
  const createdAt = createdAtRaw ? new Date(createdAtRaw).toISOString() : undefined;

  // Extract geo coordinates from common Socrata field shapes
  const location = obj.location as Record<string, unknown> | null | undefined;
  const latRaw =
    (obj.latitude as string) ??
    (obj.lat as string) ??
    (location?.latitude as string) ??
    null;
  const lngRaw =
    (obj.longitude as string) ??
    (obj.lng as string) ??
    (location?.longitude as string) ??
    null;
  const geo =
    latRaw != null && lngRaw != null
      ? { lat: parseFloat(String(latRaw)), lng: parseFloat(String(lngRaw)) }
      : undefined;

  const { score, category } = calculateAIScore(String(type));

  return {
    id: incidentId,
    incidentId,
    type: String(type),
    address: String(address),
    startTime,
    createdAt,
    source: "911",
    priority: priority ? Number(priority) : undefined,
    status: (obj.status as string) ?? "Active",
    district: (obj.police_district_number as string) ?? (obj.sector as string) ?? undefined,
    geo,
    aiScore: score,
    aiCategory: category,
  };
}

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  Pragma: "no-cache",
};

export async function GET() {
  const now = new Date();
  const since48h = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();

  const params = new URLSearchParams({
    $limit: "500",
    $order: "start_time DESC",
  });
  const url = `${SODA_BASE}?${params.toString()}`;

  try {
    const requestHeaders: Record<string, string> = { Accept: "application/json" };
    if (APP_TOKEN) requestHeaders["X-App-Token"] = APP_TOKEN;

    const res = await fetch(url, {
      headers: requestHeaders,
      cache: "no-store",
    });

    if (res.ok) {
      const raw = await res.json();
      if (Array.isArray(raw)) {
        const incidentsAll: Incident[] = (raw as Record<string, unknown>[])
          .map((obj) => normalizeObject(obj))
          .filter((i): i is Incident => i !== null)
          .sort(
            (a, b) =>
              new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
          );

        // Dataset start_time is typed as text in Socrata, so we filter 48h in-app.
        const incidents48h = incidentsAll
          .filter((i) => new Date(i.startTime).getTime() >= new Date(since48h).getTime())
          .slice(0, 150);

        if (incidents48h.length > 0) {
          return NextResponse.json(incidents48h, { headers: NO_CACHE_HEADERS });
        }

        // Fallback: still return latest incidents so queue is never empty.
        return NextResponse.json(incidentsAll.slice(0, 150), { headers: NO_CACHE_HEADERS });
      }
    }
  } catch {
    // fetch failed
  }

  return NextResponse.json([], { headers: NO_CACHE_HEADERS });
}
