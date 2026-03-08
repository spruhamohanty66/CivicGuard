import { NextRequest, NextResponse } from "next/server";
import { getMockPublicEventsForRange, getSeedPublicEvents } from "@/lib/publicEvents";

export const dynamic = "force-dynamic";

function parseISODateOnly(value: string) {
  // value: YYYY-MM-DD
  const [y, m, d] = value.split("-").map((v) => Number(v));
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d);
  if (Number.isNaN(dt.getTime())) return null;
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function inRangeInclusive(date: Date, start: Date, end: Date) {
  const t = date.getTime();
  return t >= start.getTime() && t <= end.getTime();
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const date = url.searchParams.get("date"); // YYYY-MM-DD
  const start = url.searchParams.get("start"); // YYYY-MM-DD
  const end = url.searchParams.get("end"); // YYYY-MM-DD

  const now = new Date();

  // Filter by exact date (local) if provided
  if (date) {
    const day = parseISODateOnly(date);
    if (!day) {
      return NextResponse.json({ error: "Invalid date. Use YYYY-MM-DD." }, { status: 400 });
    }
    const next = new Date(day);
    next.setDate(day.getDate() + 1);
    const seed = getSeedPublicEvents(now);
    const mock = getMockPublicEventsForRange({ start: day, end: day, cityName: "Montgomery County" });
    const merged = [...seed, ...mock].filter((e) =>
      inRangeInclusive(new Date(e.startTime), day, new Date(next.getTime() - 1))
    );
    return NextResponse.json(merged);
  }

  // Filter by range if provided
  if (start && end) {
    const s = parseISODateOnly(start);
    const e = parseISODateOnly(end);
    if (!s || !e) {
      return NextResponse.json({ error: "Invalid start/end. Use YYYY-MM-DD." }, { status: 400 });
    }
    const endOfDay = new Date(e);
    endOfDay.setHours(23, 59, 59, 999);
    const seed = getSeedPublicEvents(now);
    const mock = getMockPublicEventsForRange({ start: s, end: endOfDay, cityName: "Montgomery County" });
    const merged = [...seed, ...mock].filter((ev) => inRangeInclusive(new Date(ev.startTime), s, endOfDay));
    return NextResponse.json(merged);
  }

  // Default: return today's events
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const seed = getSeedPublicEvents(now);
  const mock = getMockPublicEventsForRange({ start: today, end: today, cityName: "Montgomery County" });
  const merged = [...seed, ...mock].filter((e) =>
    inRangeInclusive(new Date(e.startTime), today, new Date(tomorrow.getTime() - 1))
  );
  return NextResponse.json(merged);
}

