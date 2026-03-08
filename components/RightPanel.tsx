"use client";

import { useMemo } from "react";
import type { Incident } from "@/lib/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Shield,
  AlertTriangle,
  TrendingUp,
  Radio,
  Users,
  Zap,
  Activity,
  MapPin,
} from "lucide-react";

interface RightPanelProps {
  incidents: Incident[];
  mock311: Incident[];
  mockField: Incident[];
}

const UNITS = [
  { id: "1-ALPHA", status: "Patrol", district: "D1", color: "#00E87A" },
  { id: "2-BRAVO", status: "On Scene", district: "D2", color: "#FFAA00" },
  { id: "3-CHARLIE", status: "Patrol", district: "D3", color: "#00E87A" },
  { id: "4-DELTA", status: "Dispatch", district: "D4", color: "#00B8FF" },
  { id: "5-ECHO", status: "Break", district: "D1", color: "#ffffff40" },
  { id: "6-FOXTROT", status: "On Scene", district: "D3", color: "#FFAA00" },
  { id: "7-GOLF", status: "Patrol", district: "D2", color: "#00E87A" },
];

export function RightPanel({ incidents, mock311, mockField }: RightPanelProps) {
  const stats = useMemo(() => {
    const emergency = incidents.filter((i) => i.source === "911").length;
    const civic = mock311.length;
    const field = mockField.length;
    const critical = incidents.filter((i) => (i.aiScore ?? 0) >= 80).length;

    const byType: Record<string, number> = {};
    incidents.forEach((i) => {
      const key = i.type?.split(/[\s/,(-]/)[0] ?? "Other";
      byType[key] = (byType[key] ?? 0) + 1;
    });
    const topTypes = Object.entries(byType)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    return { emergency, civic, field, critical, topTypes, total: emergency + civic + field };
  }, [incidents, mock311, mockField]);

  const activeUnits = UNITS.filter((u) => u.status !== "Break").length;

  return (
    <aside className="flex flex-col bg-[#0F1117] border-l border-white/[0.08] w-72 shrink-0 h-screen overflow-hidden">
      <div className="px-4 py-3.5 border-b border-white/[0.08] shrink-0">
        <div className="flex items-center gap-2">
          <Shield className="w-3.5 h-3.5 text-dispatch" />
          <h2 className="text-xs font-bold tracking-[0.2em] uppercase text-white/60">
            Command Overview
          </h2>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-5">
          {/* ── Stat Grid ── */}
          <div className="grid grid-cols-2 gap-2">
            <StatCard
              label="911 Active"
              value={stats.emergency}
              color="#FF3D5A"
              icon={AlertTriangle}
              glow
            />
            <StatCard
              label="311 Requests"
              value={stats.civic}
              color="#FFAA00"
              icon={Users}
            />
            <StatCard
              label="Field Units"
              value={activeUnits}
              color="#00E87A"
              icon={Radio}
            />
            <StatCard
              label="Critical"
              value={stats.critical}
              color="#B06DFF"
              icon={Zap}
              glow={stats.critical > 0}
            />
          </div>

          {/* ── Total volume bar ── */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold tracking-[0.15em] uppercase text-white/25">
                Incident Volume
              </span>
              <span className="font-mono text-[10px] text-white/40">{stats.total}</span>
            </div>
            <div className="flex h-2 rounded-full overflow-hidden gap-px bg-white/5">
              {stats.total > 0 && (
                <>
                  <div
                    className="h-full rounded-l-full transition-all"
                    style={{
                      width: `${(stats.emergency / stats.total) * 100}%`,
                      backgroundColor: "#FF3D5A",
                    }}
                  />
                  <div
                    className="h-full transition-all"
                    style={{
                      width: `${(stats.civic / stats.total) * 100}%`,
                      backgroundColor: "#FFAA00",
                    }}
                  />
                  <div
                    className="h-full rounded-r-full transition-all"
                    style={{
                      width: `${(stats.field / stats.total) * 100}%`,
                      backgroundColor: "#00E87A",
                    }}
                  />
                </>
              )}
            </div>
            <div className="flex justify-between text-[10px] font-mono text-white/25">
              <span style={{ color: "#FF3D5A88" }}>911</span>
              <span style={{ color: "#FFAA0088" }}>311</span>
              <span style={{ color: "#00E87A88" }}>FIELD</span>
            </div>
          </div>

          {/* ── Top incident types ── */}
          {stats.topTypes.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-3 h-3 text-analytics" />
                <span className="text-[10px] font-bold tracking-[0.15em] uppercase text-white/25">
                  Top Incident Types
                </span>
              </div>
              <div className="space-y-1.5">
                {stats.topTypes.map(([type, count], idx) => {
                  const maxCount = stats.topTypes[0][1];
                  return (
                    <div key={type} className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-white/20 w-4">
                        {idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-[11px] text-white/60 truncate">
                            {type}
                          </span>
                          <span className="font-mono text-[10px] text-white/35 ml-2 shrink-0">
                            {count}
                          </span>
                        </div>
                        <div className="h-0.5 rounded-full bg-white/5 overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${(count / maxCount) * 100}%`,
                              backgroundColor: "#FF5FCB",
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Unit Status ── */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Radio className="w-3 h-3 text-field" />
                <span className="text-[10px] font-bold tracking-[0.15em] uppercase text-white/25">
                  Unit Status
                </span>
              </div>
              <span className="font-mono text-[10px] text-field/60">
                {activeUnits}/{UNITS.length} ACTIVE
              </span>
            </div>

            <div className="space-y-1">
              {UNITS.map((unit) => (
                <div
                  key={unit.id}
                  className="flex items-center gap-2.5 px-2.5 py-2 rounded-sm hover:bg-white/[0.03] transition-colors border border-transparent hover:border-white/[0.06]"
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: unit.color }}
                  />
                  <span className="font-mono text-xs text-white/70 flex-1">
                    {unit.id}
                  </span>
                  <span className="font-mono text-[10px]" style={{ color: unit.color }}>
                    {unit.status}
                  </span>
                  <span className="font-mono text-[10px] text-white/25">
                    {unit.district}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* ── System Status ── */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Activity className="w-3 h-3 text-datafeed" />
              <span className="text-[10px] font-bold tracking-[0.15em] uppercase text-white/25">
                System Status
              </span>
            </div>
            <div className="space-y-1.5">
              {[
                { label: "CAD Feed", status: "LIVE", color: "#00FFE1" },
                { label: "AI Core", status: "ONLINE", color: "#B06DFF" },
                { label: "MCPD API", status: "SYNCED", color: "#00FFE1" },
                { label: "Radio Net", status: "CLEAR", color: "#00E87A" },
                { label: "GIS Overlay", status: "ACTIVE", color: "#00B8FF" },
              ].map(({ label, status, color }) => (
                <div key={label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-1.5 w-1.5 rounded-full animate-pulse"
                      style={{ backgroundColor: color }}
                    />
                    <span className="text-[11px] text-white/40">{label}</span>
                  </div>
                  <span
                    className="font-mono text-[10px] font-bold"
                    style={{ color }}
                  >
                    {status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Montgomery County coverage ── */}
          <div
            className="rounded-sm border p-3 space-y-2"
            style={{
              borderColor: "rgba(0,184,255,0.15)",
              backgroundColor: "rgba(0,184,255,0.04)",
            }}
          >
            <div className="flex items-center gap-2">
              <MapPin className="w-3 h-3 text-dispatch/60" />
              <span className="text-[10px] font-bold tracking-widest uppercase text-dispatch/50">
                Coverage Area
              </span>
            </div>
            <p className="font-mono text-[11px] text-white/40 leading-relaxed">
              Montgomery County, MD
              <br />
              Jurisdiction: MCPD
              <br />
              Data: Real-time CAD
            </p>
          </div>
        </div>
      </ScrollArea>
    </aside>
  );
}

function StatCard({
  label,
  value,
  color,
  icon: Icon,
  glow,
}: {
  label: string;
  value: number;
  color: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  glow?: boolean;
}) {
  return (
    <div
      className="rounded-sm border p-3 space-y-2 transition-all"
      style={{
        borderColor: `${color}25`,
        backgroundColor: `${color}08`,
        boxShadow: glow && value > 0 ? `0 0 20px ${color}20` : "none",
      }}
    >
      <div className="flex items-center justify-between">
        <Icon className="w-3.5 h-3.5" style={{ color }} />
        <span
          className="font-mono text-[10px] font-bold px-1 py-0.5 rounded-sm"
          style={{ color, backgroundColor: `${color}15` }}
        >
          ●
        </span>
      </div>
      <div>
        <div
          className="font-mono text-2xl font-bold leading-none"
          style={{ color }}
        >
          {value}
        </div>
        <div className="text-[10px] text-white/35 mt-1 uppercase tracking-wider">
          {label}
        </div>
      </div>
    </div>
  );
}
