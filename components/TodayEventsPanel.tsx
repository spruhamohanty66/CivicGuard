"use client";

import { useEffect, useState } from "react";
import type { PublicEvent } from "@/lib/publicEvents";
import { CalendarDays, MapPin, ShieldAlert } from "lucide-react";
import { format, parseISO } from "date-fns";

function riskColor(risk: number) {
  if (risk >= 5) return "#FF3D5A";
  if (risk >= 4) return "#FF6B35";
  if (risk >= 3) return "#FFAA00";
  if (risk >= 2) return "#00B8FF";
  return "#00E87A";
}

export function TodayEventsPanel() {
  const [events, setEvents] = useState<PublicEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/public-events", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: PublicEvent[] = await res.json();
        setEvents(Array.isArray(data) ? data : []);
      } catch (e) {
        if ((e as any)?.name === "AbortError") return;
        setError("Unable to load today's events.");
        setEvents([]);
      } finally {
        setLoading(false);
      }
    };
    load();
    return () => controller.abort();
  }, []);

  return (
    <aside className="w-[360px] shrink-0 border-l border-white/[0.10] bg-[#0F1117] flex flex-col">
      <div className="px-4 py-3 border-b border-white/[0.08]">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-3.5 h-3.5 text-civic" />
          <h3 className="text-xs font-bold tracking-[0.2em] uppercase text-white/60">
            Today's Events
          </h3>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-2">
        {loading && (
          <p className="font-mono text-[10px] text-white/35 uppercase tracking-widest">
            Loading...
          </p>
        )}
        {error && <p className="text-xs text-emergency">{error}</p>}
        {!loading && !error && events.length === 0 && (
          <p className="text-xs text-white/35">No public events scheduled for today.</p>
        )}

        {events.map((ev) => {
          const color = riskColor(ev.riskLevel);
          const start = format(parseISO(ev.startTime), "HH:mm");
          const end = ev.endTime ? format(parseISO(ev.endTime), "HH:mm") : null;
          return (
            <div
              key={ev.id}
              className="rounded-lg border p-2.5 space-y-1.5"
              style={{ borderColor: `${color}35`, backgroundColor: `${color}10` }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-white/85 truncate">{ev.title}</p>
                  <p className="font-mono text-[10px] text-white/45">
                    {start}{end ? `–${end}` : ""} · {ev.category}
                  </p>
                </div>
                <div className="shrink-0 flex items-center gap-1">
                  <ShieldAlert className="w-3.5 h-3.5" style={{ color }} />
                  <span className="font-mono text-[10px] font-bold" style={{ color }}>
                    R{ev.riskLevel}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-white/55">
                <MapPin className="w-3 h-3 text-white/30 shrink-0" />
                <span className="truncate">
                  {ev.locationName}{ev.address ? ` — ${ev.address}` : ""}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}

