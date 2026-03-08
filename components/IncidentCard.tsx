"use client";

import { cn } from "@/lib/utils";
import type { Incident } from "@/lib/types";
import { MapPin, Clock, AlertTriangle } from "lucide-react";

// --- helpers -----------------------------------------------------------

function elapsedClock(isoString: string, nowMs: number): string {
  const diffSec = Math.max(0, Math.floor((nowMs - new Date(isoString).getTime()) / 1000));
  const h = String(Math.floor(diffSec / 3600)).padStart(2, "0");
  const m = String(Math.floor((diffSec % 3600) / 60)).padStart(2, "0");
  const s = String(diffSec % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatFullTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZone: "UTC",
  });
}

function priorityBg(p?: number): string {
  if (p === 0) return "#FF3D5A";
  if (p === 1) return "#FF6B35";
  if (p === 2) return "#FFAA00";
  if (p === 3) return "#00B8FF";
  if (p === 4) return "#00E87A";
  return "rgba(255,255,255,0.15)";
}

function priorityLabel(p?: number): string {
  if (p === 0) return "CRITICAL";
  if (p === 1) return "HIGH";
  if (p === 2) return "ELEVATED";
  if (p === 3) return "MODERATE";
  if (p === 4) return "LOW";
  return "UNKNOWN";
}

function aiScoreBg(score: number): string {
  if (score >= 80) return "#FF3D5A";
  if (score >= 50) return "#FFAA00";
  return "#00E87A";
}

// --- component ---------------------------------------------------------

interface IncidentCardProps {
  incident: Incident;
  selected: boolean;
  onClick: () => void;
  nowMs?: number;
}

export function IncidentCard({ incident, selected, onClick, nowMs = Date.now() }: IncidentCardProps) {
  const isCritical = (incident.priority !== undefined && incident.priority <= 1) || (incident.aiScore ?? 0) >= 80;

  return (
    <button
      onClick={onClick}
      className={cn(
        "relative w-full text-left transition-all duration-150",
        "px-4 py-3.5 space-y-2.5 mx-2 my-1 rounded-xl border",
        selected
          ? "bg-[#131826] border-white/25 shadow-[0_0_24px_rgba(0,0,0,0.35)]"
          : "bg-[#0B0F1A]/70 border-white/[0.10] hover:bg-[#12182A]",
        selected && isCritical && "glow-emergency"
      )}
    >
      {/* Critical pulsing dot */}
      {isCritical && (
        <span className="absolute top-3.5 left-3.5 flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emergency opacity-75" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emergency" />
        </span>
      )}

      {/* ── Row 1: Priority + AI Score + ID ── */}
      <div className="flex items-center gap-2 min-w-0 overflow-hidden pr-16">
        {incident.priority !== undefined && (
          <div className="flex items-center gap-1.5 shrink-0 rounded-md px-2 py-0.5 border border-white/10 bg-white/[0.03]">
            <AlertTriangle
              className="w-3.5 h-3.5 shrink-0"
              style={{ color: priorityBg(incident.priority) }}
            />
            <span
              className="font-mono text-[11px] font-bold"
              style={{ color: priorityBg(incident.priority) }}
            >
              P{incident.priority}
            </span>
            <span className="font-mono text-[10px] text-white/45">
              {priorityLabel(incident.priority)}
            </span>
          </div>
        )}
        {incident.aiScore !== undefined && (
          <span
            className="font-mono text-[11px] font-bold px-2.5 py-0.5 rounded-sm shrink-0"
            style={{ backgroundColor: aiScoreBg(incident.aiScore), color: "#03050D" }}
          >
            AI {incident.aiScore}
          </span>
        )}
        <span className="font-mono text-[13px] text-white/40 truncate min-w-0">
          #{incident.incidentId}
        </span>
      </div>

      {/* ── Row 2: Incident type ── */}
      <h3 className="font-bold text-white uppercase text-sm leading-tight tracking-wide break-words">
        {incident.type}
      </h3>

      {/* ── Source badge ── */}
      {incident.source === "911" ? (
        <div
          className="flex items-center gap-2 rounded-md px-2.5 py-1.5 w-full"
          style={{ backgroundColor: "rgba(255,61,90,0.12)", border: "1px solid rgba(255,61,90,0.35)" }}
        >
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emergency opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emergency" />
          </span>
          <span className="font-mono text-xs font-bold text-emergency tracking-[0.2em]">911 EMERGENCY CALL</span>
        </div>
      ) : incident.source === "311" ? (
        <div
          className="flex items-center gap-2 rounded-md px-2.5 py-1.5 w-full"
          style={{ backgroundColor: "rgba(255,170,0,0.10)", border: "1px solid rgba(255,170,0,0.30)" }}
        >
          <span className="inline-flex rounded-full h-2.5 w-2.5 bg-civic shrink-0" />
          <span className="font-mono text-xs font-bold text-civic tracking-[0.2em]">311 CIVIC REPORT</span>
        </div>
      ) : incident.source === "field" ? (
        <div
          className="flex items-center gap-2 rounded-md px-2.5 py-1.5 w-full"
          style={{ backgroundColor: "rgba(0,232,122,0.08)", border: "1px solid rgba(0,232,122,0.25)" }}
        >
          <span className="inline-flex rounded-full h-2.5 w-2.5 bg-field shrink-0" />
          <span className="font-mono text-xs font-bold text-field tracking-[0.2em]">FIELD REPORT</span>
        </div>
      ) : null}

      {/* ── Divider ── */}
      <div className="border-t border-white/[0.07]" />

      {/* ── Row 3: Address ── */}
      <div className="flex items-center gap-2.5">
        <MapPin className="w-4 h-4 shrink-0 text-emergency" />
        <span className="text-sm font-bold text-white uppercase tracking-wide truncate">
          {incident.address}
        </span>
      </div>

      {/* ── Divider ── */}
      <div className="border-t border-white/[0.07]" />

      {/* ── Row 4: Reported + Elapsed ── */}
      <div className="flex items-center gap-2.5">
        <Clock className="w-4 h-4 shrink-0 text-emergency" />
        <span className="font-mono text-[11px] text-white/55 leading-relaxed">
          {formatDate(incident.createdAt ?? incident.startTime)} · {formatFullTime(incident.createdAt ?? incident.startTime)} ·{" "}
          <span className="font-bold text-field">ELAPSED {elapsedClock(incident.createdAt ?? incident.startTime, nowMs)}</span>
        </span>
      </div>
    </button>
  );
}
