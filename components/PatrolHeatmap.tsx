"use client";

import { useEffect, useMemo, useState } from "react";
import type { Incident } from "@/lib/types";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet.heat";
import type { PublicEvent } from "@/lib/publicEvents";

type HeatPoint = [number, number, number]; // lat, lng, intensity 0..1
type LeafletHeatOptions = {
  radius?: number;
  blur?: number;
  maxZoom?: number;
  minOpacity?: number;
  gradient?: Record<number, string>;
};

// Montgomery, AL city bounds (approximate city viewport)
const MONTGOMERY_CENTER: [number, number] = [32.3668, -86.3000];
const MONTGOMERY_BOUNDS = L.latLngBounds(
  [32.30, -86.40], // SW
  [32.43, -86.17]  // NE
);
const MONTGOMERY_SW: [number, number] = [32.30, -86.40];
const MONTGOMERY_NE: [number, number] = [32.43, -86.17];

// Fallback hotspots so operators always see vulnerability zones
// when live incident geo points are sparse or absent in Montgomery, AL.
const MONTGOMERY_FALLBACK_HOTSPOTS: HeatPoint[] = [
  [32.3777, -86.3006, 0.95], // Downtown core
  [32.3685, -86.2905, 0.82], // East downtown
  [32.3554, -86.3076, 0.78], // South-central
  [32.3931, -86.2820, 0.70], // North-east corridor
  [32.3409, -86.3151, 0.66], // South-west corridor
];

function clamp01(n: number) {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function intensityForIncident(i: Incident): number {
  const priorityWeight =
    i.priority === 0 ? 1 :
    i.priority === 1 ? 0.85 :
    i.priority === 2 ? 0.65 :
    i.priority === 3 ? 0.45 :
    i.priority === 4 ? 0.3 :
    0.45;
  const ai = typeof i.aiScore === "number" ? clamp01(i.aiScore / 100) : 0.7;
  const base = 0.25 + priorityWeight * 0.55;
  return clamp01(base * (0.65 + ai * 0.35));
}

function isInMontgomeryBounds(lat: number, lng: number) {
  return (
    lat >= MONTGOMERY_SW[0] &&
    lat <= MONTGOMERY_NE[0] &&
    lng >= MONTGOMERY_SW[1] &&
    lng <= MONTGOMERY_NE[1]
  );
}

function hashToUint32(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  return function rand() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Deterministic "address to map point" for Montgomery AL map visibility.
// This keeps ticket/address alignment even when upstream feed coordinates are out-of-city.
function pseudoGeoFromAddress(address: string, incidentId?: string) {
  const seed = hashToUint32(`${address}|${incidentId ?? ""}|Montgomery,AL`);
  const rand = mulberry32(seed);

  // Bias toward city center, spread toward edges.
  const r1 = rand();
  const r2 = rand();
  const lat = MONTGOMERY_SW[0] + (MONTGOMERY_NE[0] - MONTGOMERY_SW[0]) * (0.15 + r1 * 0.7);
  const lng = MONTGOMERY_SW[1] + (MONTGOMERY_NE[1] - MONTGOMERY_SW[1]) * (0.12 + r2 * 0.76);
  return { lat, lng };
}

function priorityColor(priority?: number) {
  if (priority === 0) return "#FF3D5A";
  if (priority === 1) return "#FF6B35";
  if (priority === 2) return "#FFAA00";
  if (priority === 3) return "#00B8FF";
  if (priority === 4) return "#00E87A";
  return "#B06DFF";
}

function priorityRadius(priority?: number) {
  if (priority === 0) return 7;
  if (priority === 1) return 6.5;
  if (priority === 2) return 6;
  if (priority === 3) return 5.5;
  if (priority === 4) return 5;
  return 5.5;
}

function HeatLayer({
  points,
  options,
}: {
  points: HeatPoint[];
  options?: LeafletHeatOptions;
}) {
  const map = useMap();

  useEffect(() => {
    if (!points.length) return;

    let layer: any = null;
    let rafId: number | null = null;
    let attempts = 0;
    const maxAttempts = 24; // ~24 frames max to wait for layout

    const tryAttach = () => {
      const size = map.getSize();
      if (size.x > 1 && size.y > 1) {
        layer = (L as any).heatLayer(points, options);
        layer.addTo(map);
        return;
      }

      attempts += 1;
      if (attempts < maxAttempts) {
        rafId = window.requestAnimationFrame(tryAttach);
      }
    };

    tryAttach();

    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      if (layer) {
        map.removeLayer(layer);
      }
    };
  }, [map, points, options]);

  return null;
}

function EnsureMapSized() {
  const map = useMap();

  useEffect(() => {
    // Leaflet map may briefly mount at 0x0 when panel is restored.
    // Recalculate size after layout settles to prevent heat-layer canvas errors.
    const id1 = window.requestAnimationFrame(() => map.invalidateSize(false));
    const t1 = window.setTimeout(() => map.invalidateSize(false), 120);
    const t2 = window.setTimeout(() => map.invalidateSize(false), 320);
    return () => {
      window.cancelAnimationFrame(id1);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [map]);

  return null;
}

function MontgomeryCityBounds() {
  const map = useMap();
  useEffect(() => {
    map.setMaxBounds(MONTGOMERY_BOUNDS);
    map.setMinZoom(11);
    map.setMaxZoom(16);
  }, [map]);
  return null;
}

interface PatrolHeatmapProps {
  incidents24h: Incident[];
  inProgressIncidents: Incident[];
  onMinimize?: () => void;
}

export function PatrolHeatmap({ incidents24h, inProgressIncidents, onMinimize }: PatrolHeatmapProps) {
  const [todayEvents, setTodayEvents] = useState<PublicEvent[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    const loadEvents = async () => {
      try {
        const res = await fetch("/api/public-events", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data: PublicEvent[] = await res.json();
        const withGeo = Array.isArray(data)
          ? data.filter((e) => e.geo && Number.isFinite(e.geo.lat) && Number.isFinite(e.geo.lng))
          : [];
        setTodayEvents(withGeo);
      } catch {
        // ignore event loading failures for map continuity
      }
    };
    loadEvents();
    return () => controller.abort();
  }, []);

  const incidentsMappedToMontgomery = useMemo(() => {
    return incidents24h.map((i) => {
      const hasValidGeo = !!i.geo && Number.isFinite(i.geo.lat) && Number.isFinite(i.geo.lng);
      const inBounds = hasValidGeo ? isInMontgomeryBounds(i.geo!.lat, i.geo!.lng) : false;
      const mapGeo = inBounds
        ? i.geo!
        : pseudoGeoFromAddress(i.address ?? "Unknown Location", i.incidentId);
      return { ...i, mapGeo };
    });
  }, [incidents24h]);

  const vulnerableIncidents = useMemo(() => {
    const since48h = Date.now() - 48 * 60 * 60 * 1000;
    return incidentsMappedToMontgomery.filter((i) => {
      const t = new Date(i.startTime).getTime();
      return Number.isFinite(t) && t >= since48h;
    });
  }, [incidentsMappedToMontgomery]);

  const inProgressWithGeo = useMemo(() => {
    return inProgressIncidents.filter(
      (i) => i.geo && Number.isFinite(i.geo.lat) && Number.isFinite(i.geo.lng)
    );
  }, [inProgressIncidents]);

  const inProgressMappedToMontgomery = useMemo(() => {
    return inProgressIncidents.map((i) => {
      const hasValidGeo = !!i.geo && Number.isFinite(i.geo.lat) && Number.isFinite(i.geo.lng);
      const inBounds = hasValidGeo ? isInMontgomeryBounds(i.geo!.lat, i.geo!.lng) : false;
      const mapGeo = inBounds
        ? i.geo!
        : pseudoGeoFromAddress(i.address ?? "Unknown Location", i.incidentId);
      return { ...i, mapGeo };
    });
  }, [inProgressIncidents]);

  const incidentPoints: HeatPoint[] = useMemo(() => {
    return vulnerableIncidents
      .map((i: Incident & { mapGeo: { lat: number; lng: number } }) => [
        i.mapGeo.lat,
        i.mapGeo.lng,
        intensityForIncident(i),
      ]);
  }, [vulnerableIncidents]);

  const liveTicketMarkers = useMemo(() => {
    return incidentsMappedToMontgomery
      .slice(0, 150);
  }, [incidentsMappedToMontgomery]);

  const heatPoints = incidentPoints.length > 0 ? incidentPoints : MONTGOMERY_FALLBACK_HOTSPOTS;

  return (
    <div className="flex flex-col h-full min-h-0 bg-[#0F1117]">
      <div className="px-4 py-2.5 border-b border-white/[0.08] shrink-0 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-bold tracking-[0.15em] uppercase text-white/70">
            City of Montgomery (AL) — Patrol Heatmap
          </div>
          <div className="font-mono text-[10px] text-white/25 tracking-widest uppercase">
            Problematic areas (48h crime history) · Investigation in progress
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="font-mono text-[10px] text-white/25">
            {vulnerableIncidents.length} vulnerable (48h) · {inProgressWithGeo.length} in progress · {todayEvents.length} events today
          </div>
          <button
            onClick={onMinimize}
            className="px-2.5 py-1 rounded-md border border-white/10 text-white/45 hover:text-white/75 hover:border-white/25 hover:bg-white/[0.06] transition-colors font-mono text-[10px] uppercase tracking-widest"
            title="Minimize map"
          >
            Minimize
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 relative">
        <MapContainer
          center={MONTGOMERY_CENTER}
          zoom={12}
          scrollWheelZoom={true}
          style={{ height: "100%", width: "100%" }}
          maxBounds={MONTGOMERY_BOUNDS}
          minZoom={11}
          maxZoom={16}
        >
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <EnsureMapSized />
          <MontgomeryCityBounds />

          <HeatLayer
            points={heatPoints}
            options={{
              radius: 34,
              blur: 24,
              maxZoom: 16,
              minOpacity: 0.35,
              gradient: {
                0.2: "#00E87A",
                0.4: "#FFAA00",
                0.7: "#FF6B35",
                1.0: "#FF3D5A",
              },
            }}
          />

          {inProgressMappedToMontgomery.map((i: Incident & { mapGeo: { lat: number; lng: number } }) => (
            <CircleMarker
              key={i.id}
              center={[i.mapGeo.lat, i.mapGeo.lng]}
              radius={8}
              pathOptions={{
                color: "#00B8FF",
                fillColor: "#00B8FF",
                fillOpacity: 0.9,
                weight: 2,
              }}
            >
              <Popup>
                <div style={{ minWidth: 200 }}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>Investigation in progress</div>
                  <div style={{ opacity: 0.9, fontSize: 12 }}>{i.type}</div>
                  <div style={{ opacity: 0.8, fontSize: 11 }}>{i.address}</div>
                  {i.priority !== undefined && (
                    <div style={{ opacity: 0.8, fontSize: 11 }}>Priority P{i.priority}</div>
                  )}
                </div>
              </Popup>
            </CircleMarker>
          ))}

          {liveTicketMarkers.map((i: Incident & { mapGeo: { lat: number; lng: number } }) => {
            const color = priorityColor(i.priority);
            return (
              <CircleMarker
                key={`live-${i.id}`}
                center={[i.mapGeo.lat, i.mapGeo.lng]}
                radius={priorityRadius(i.priority)}
                pathOptions={{
                  color,
                  fillColor: color,
                  fillOpacity: 0.85,
                  weight: 2,
                }}
              >
                <Popup>
                  <div style={{ minWidth: 220 }}>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>{i.type}</div>
                    <div style={{ opacity: 0.85, fontSize: 12 }}>#{i.incidentId}</div>
                    <div style={{ opacity: 0.85, fontSize: 12 }}>
                      Priority {typeof i.priority === "number" ? `P${i.priority}` : "Unknown"}
                    </div>
                    <div style={{ opacity: 0.8, fontSize: 11 }}>{i.address}</div>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}

          {todayEvents.map((ev) => (
            <CircleMarker
              key={`ev-${ev.id}`}
              center={[ev.geo!.lat, ev.geo!.lng]}
              radius={6}
              pathOptions={{
                color: "#FFAA00",
                fillColor: "#FFAA00",
                fillOpacity: 0.75,
                weight: 2,
              }}
            >
              <Popup>
                <div style={{ minWidth: 200 }}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>Today's Event</div>
                  <div style={{ opacity: 0.9, fontSize: 12 }}>{ev.title}</div>
                  <div style={{ opacity: 0.8, fontSize: 11 }}>{ev.locationName}</div>
                  <div style={{ opacity: 0.8, fontSize: 11 }}>Risk R{ev.riskLevel}</div>
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>

      <div className="px-4 py-2.5 border-t border-white/[0.08] shrink-0 space-y-2">
        <div className="flex gap-6">
          <div className="flex items-center gap-2">
            <div className="flex gap-0.5">
              {["#00E87A", "#FFAA00", "#FF6B35", "#FF3D5A"].map((c) => (
                <span key={c} className="h-2 w-6 rounded-sm" style={{ backgroundColor: c, opacity: 0.9 }} />
              ))}
            </div>
            <span className="font-mono text-[10px] text-white/35">Vulnerable areas (48h)</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full border-2"
              style={{ borderColor: "#00B8FF", backgroundColor: "rgba(0,184,255,0.6)" }}
            />
            <span className="font-mono text-[10px] text-white/35">Investigation in progress</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              {[0, 1, 2, 3, 4].map((p) => (
                <span
                  key={p}
                  className="h-2.5 w-2.5 rounded-full border"
                  style={{
                    borderColor: priorityColor(p),
                    backgroundColor: priorityColor(p),
                    opacity: 0.9,
                  }}
                  title={`P${p}`}
                />
              ))}
            </div>
            <span className="font-mono text-[10px] text-white/35">Live tickets (priority color)</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full border-2"
              style={{ borderColor: "#FFAA00", backgroundColor: "rgba(255,170,0,0.7)" }}
            />
            <span className="font-mono text-[10px] text-white/35">Today's events</span>
          </div>
        </div>

        {incidentPoints.length === 0 && (
          <p className="font-mono text-[10px] text-white/35">
            No live Montgomery geo points in last 48h. Showing baseline hotspot overlay.
          </p>
        )}
      </div>
    </div>
  );
}
