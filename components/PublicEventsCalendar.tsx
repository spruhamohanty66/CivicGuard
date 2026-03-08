"use client";

import { useEffect, useMemo, useState } from "react";
import type { PublicEvent } from "@/lib/publicEvents";
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight, MapPin, ShieldAlert } from "lucide-react";

function ymd(d: Date) {
  return format(d, "yyyy-MM-dd");
}

function riskColor(risk: number) {
  if (risk >= 5) return "#FF3D5A";
  if (risk >= 4) return "#FF6B35";
  if (risk >= 3) return "#FFAA00";
  if (risk >= 2) return "#00B8FF";
  return "#00E87A";
}

export function PublicEventsCalendar() {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selected, setSelected] = useState(() => startOfDay(new Date()));
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<PublicEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const today = startOfDay(new Date());

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const start = ymd(startOfWeek(startOfMonth(month), { weekStartsOn: 0 }));
        const end = ymd(endOfWeek(endOfMonth(month), { weekStartsOn: 0 }));
        const res = await fetch(`/api/public-events?start=${start}&end=${end}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: PublicEvent[] = await res.json();
        setEvents(Array.isArray(data) ? data : []);
      } catch (e) {
        if ((e as any)?.name === "AbortError") return;
        setError("Unable to load events.");
        setEvents([]);
      } finally {
        setLoading(false);
      }
    };
    load();
    return () => controller.abort();
  }, [month]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, PublicEvent[]>();
    for (const ev of events) {
      const evDate = startOfDay(parseISO(ev.startTime));
      if (evDate < today) continue;
      const key = ymd(evDate);
      const list = map.get(key) ?? [];
      list.push(ev);
      map.set(key, list);
    }
    // stable-ish ordering: earliest start then risk desc
    for (const [k, list] of map.entries()) {
      list.sort((a, b) => {
        const ta = new Date(a.startTime).getTime();
        const tb = new Date(b.startTime).getTime();
        if (ta !== tb) return ta - tb;
        return (b.riskLevel ?? 1) - (a.riskLevel ?? 1);
      });
      map.set(k, list);
    }
    return map;
  }, [events, today]);

  const selectedKey = ymd(selected);
  const selectedEvents = eventsByDay.get(selectedKey) ?? [];

  const gridStart = startOfWeek(startOfMonth(month), { weekStartsOn: 0 });
  const gridEnd = endOfWeek(endOfMonth(month), { weekStartsOn: 0 });
  const days: Date[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d);

  return (
    <section className="rounded-sm border border-white/[0.08] bg-[#0F1117] overflow-hidden">
      <div className="px-4 py-3 border-b border-white/[0.08] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-3.5 h-3.5 text-civic" />
          <h3 className="text-xs font-bold tracking-[0.2em] uppercase text-white/60">
            Public Events
          </h3>
        </div>
        <button
          onClick={() => {
            const t = new Date();
            setMonth(startOfMonth(t));
            setSelected(t);
          }}
          className="font-mono text-[10px] text-white/30 hover:text-white/60 transition-colors"
          title="Jump to today"
        >
          TODAY
        </button>
      </div>

      <div className="px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMonth((m) => startOfMonth(subMonths(m, 1)))}
            className="w-7 h-7 rounded-md border border-white/10 hover:bg-white/[0.04] transition-colors flex items-center justify-center"
            title="Previous month"
          >
            <ChevronLeft className="w-4 h-4 text-white/40" />
          </button>
          <button
            onClick={() => setMonth((m) => startOfMonth(addMonths(m, 1)))}
            className="w-7 h-7 rounded-md border border-white/10 hover:bg-white/[0.04] transition-colors flex items-center justify-center"
            title="Next month"
          >
            <ChevronRight className="w-4 h-4 text-white/40" />
          </button>
          <div className="ml-1">
            <div className="text-sm font-bold text-white/80">{format(month, "MMMM yyyy")}</div>
            <div className="font-mono text-[10px] text-white/25 tracking-widest uppercase">
              Ops awareness calendar
            </div>
          </div>
        </div>

        <div className="font-mono text-[10px] text-white/25">
          {loading ? "LOADING…" : `${events.length} EVENT${events.length === 1 ? "" : "S"}`}
        </div>
      </div>

      <div className="px-4 pb-3">
        <div className="grid grid-cols-7 gap-1 text-[10px] font-mono text-white/25 mb-2">
          {["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map((d) => (
            <div key={d} className="text-center">{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {days.map((d) => {
            const key = ymd(d);
            const dayEvents = eventsByDay.get(key) ?? [];
            const maxRisk = dayEvents.reduce((m, e) => Math.max(m, e.riskLevel ?? 1), 0);
            const dim = !isSameMonth(d, month);
            const isToday = isSameDay(d, today);
            const isSelected = isSameDay(d, selected);
            const isPastDay = d < today;

            return (
              <button
                key={key}
                onClick={() => !isPastDay && setSelected(d)}
                disabled={isPastDay}
                className="h-9 rounded-md border text-left px-2 py-1 transition-colors"
                style={{
                  borderColor: isPastDay
                    ? "rgba(255,255,255,0.06)"
                    : isSelected
                      ? "rgba(255,255,255,0.22)"
                      : "rgba(255,255,255,0.08)",
                  backgroundColor: isPastDay
                    ? "rgba(255,255,255,0.01)"
                    : isSelected
                      ? "rgba(255,255,255,0.06)"
                      : "rgba(255,255,255,0.02)",
                  opacity: isPastDay ? 0.3 : dim ? 0.45 : 1,
                  cursor: isPastDay ? "not-allowed" : "pointer",
                }}
                title={
                  isPastDay
                    ? "Past date"
                    : dayEvents.length
                      ? `${dayEvents.length} event(s)`
                      : "No events"
                }
              >
                <div className="flex items-center justify-between">
                  <span
                    className="font-mono text-[11px] font-bold"
                    style={{ color: isPastDay ? "rgba(255,255,255,0.25)" : isToday ? "#00E87A" : "rgba(255,255,255,0.55)" }}
                  >
                    {format(d, "d")}
                  </span>
                  {!isPastDay && dayEvents.length > 0 && (
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: riskColor(maxRisk) }}
                    />
                  )}
                </div>
                {!isPastDay && (
                  <div className="mt-1 flex gap-1">
                    {dayEvents.slice(0, 3).map((e) => (
                      <span
                        key={e.id}
                        className="h-1 w-1 rounded-full"
                        style={{ backgroundColor: riskColor(e.riskLevel) }}
                      />
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-3 rounded-md border border-white/[0.08] bg-[#03050D] p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs font-bold text-white/75 uppercase tracking-wide truncate">
                {format(selected, "EEE, MMM d")}
              </div>
              <div className="font-mono text-[10px] text-white/25 tracking-widest uppercase">
                Event briefing
              </div>
            </div>
            {error && <span className="font-mono text-[10px] text-emergency">{error}</span>}
          </div>

          {selectedEvents.length === 0 ? (
            <div className="mt-2 text-[11px] text-white/35">
              No scheduled public events for this day.
            </div>
          ) : (
            <div className="mt-2 space-y-2">
              {selectedEvents.map((ev) => {
                const color = riskColor(ev.riskLevel);
                const start = format(parseISO(ev.startTime), "HH:mm");
                const end = ev.endTime ? format(parseISO(ev.endTime), "HH:mm") : null;
                return (
                  <div
                    key={ev.id}
                    className="rounded-md border p-2.5 space-y-1.5"
                    style={{ borderColor: `${color}30`, backgroundColor: `${color}08` }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[11px] font-bold text-white/80 truncate">
                          {ev.title}
                        </div>
                        <div className="font-mono text-[10px] text-white/35">
                          {start}{end ? `–${end}` : ""} · {ev.category}
                          {typeof ev.expectedAttendance === "number" ? ` · ~${ev.expectedAttendance}` : ""}
                        </div>
                      </div>
                      <div className="shrink-0 flex items-center gap-1">
                        <ShieldAlert className="w-3.5 h-3.5" style={{ color }} />
                        <span className="font-mono text-[10px] font-bold" style={{ color }}>
                          R{ev.riskLevel}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 text-[11px] text-white/55">
                      <MapPin className="w-3 h-3 text-white/25 shrink-0" />
                      <span className="truncate">
                        {ev.locationName}{ev.address ? ` — ${ev.address}` : ""}
                      </span>
                    </div>

                    {ev.notes && (
                      <div className="text-[11px] text-white/45 leading-relaxed">
                        {ev.notes}
                      </div>
                    )}

                    {ev.recommendedPosture?.length ? (
                      <div className="pt-1 space-y-1">
                        {ev.recommendedPosture.slice(0, 3).map((line, idx) => (
                          <div key={idx} className="font-mono text-[10px] text-white/35">
                            - {line}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

