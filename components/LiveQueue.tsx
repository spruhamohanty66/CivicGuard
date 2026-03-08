"use client";

import { useState, useMemo, useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { IncidentCard } from "@/components/IncidentCard";
import type { Incident, FilterTab } from "@/lib/types";
import { RefreshCw, AlertCircle, Mic, X, ChevronRight, CheckCircle2 } from "lucide-react";
import { calculateAIScore } from "@/lib/aiScore";

interface LiveQueueProps {
  incidents: Incident[];
  simulatedIncidents: Incident[];
  fieldIncidents: Incident[];
  completedIncidents: Incident[];
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  selectedId: string | null;
  onSelect: (incident: Incident) => void;
  onAddFieldIncident: (incident: Incident) => void;
}

export function LiveQueue({
  incidents,
  simulatedIncidents,
  fieldIncidents,
  completedIncidents,
  loading,
  error,
  lastUpdated,
  selectedId,
  onSelect,
  onAddFieldIncident,
}: LiveQueueProps) {
  const tabIds = {
    incomingTrigger: "livequeue-tab-incoming",
    fieldTrigger: "livequeue-tab-field",
    completedTrigger: "livequeue-tab-completed",
    incomingPanel: "livequeue-panel-incoming",
    fieldPanel: "livequeue-panel-field",
    completedPanel: "livequeue-panel-completed",
  } as const;

  const [tab, setTab] = useState<FilterTab>("incoming");
  const [secondsSinceSync, setSecondsSinceSync] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [showConfirm, setShowConfirm] = useState(false);
  const [reportingState, setReportingState] = useState<"idle" | "listening" | "processing">("idle");
  const [searchText, setSearchText] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState<"all" | "1" | "2" | "3">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | FilterTab>("all");
  const [timeRangeFilter, setTimeRangeFilter] = useState<"all" | "1h" | "4h" | "24h">("all");

  useEffect(() => {
    setSecondsSinceSync(0);
    const id = setInterval(() => {
      setSecondsSinceSync((s) => s + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [lastUpdated]);

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const [reportError, setReportError] = useState<string | null>(null);

  async function handleProceedReport() {
    setShowConfirm(false);
    setReportError(null);

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setReportError("Voice not supported. Use Chrome.");
      return;
    }

    // Get GPS in parallel with voice
    const geoPromise = new Promise<{ lat: number; lng: number } | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(null),
        { timeout: 8000 }
      );
    });

    setReportingState("listening");
    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.start();

    recognition.onresult = async (event: any) => {
      const transcript = event.results[0][0].transcript;
      setReportingState("processing");

      try {
        const [gptRes, geo] = await Promise.all([
          fetch("/api/field-report", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ transcript }),
          }).then((r) => r.json()),
          geoPromise,
        ]);

        const { incidentType, priority } = gptRes;
        const { score, category } = calculateAIScore(incidentType);
        const now = new Date().toISOString();
        const id = `field-${Date.now()}`;

        const newIncident: Incident = {
          id,
          incidentId: id,
          type: incidentType,
          address: geo ? `${geo.lat.toFixed(5)}, ${geo.lng.toFixed(5)}` : "GPS unavailable",
          startTime: now,
          source: "field",
          priority,
          aiScore: score,
          aiCategory: category,
          geo: geo ?? undefined,
        };

        onAddFieldIncident(newIncident);
        setTab("field");
      } catch {
        setReportError("Failed to process report. Please try again.");
      } finally {
        setReportingState("idle");
      }
    };

    recognition.onerror = () => {
      setReportingState("idle");
      setReportError("Voice capture failed. Please try again.");
    };
    recognition.onend = () => {
      if (reportingState === "listening") setReportingState("idle");
    };
  }

  const completedIdSet = useMemo(
    () => new Set(completedIncidents.map((c) => c.id)),
    [completedIncidents]
  );

  const sortedIncidents = useMemo(
    () =>
      [...simulatedIncidents, ...incidents]
        .filter((i) => !completedIdSet.has(i.id))
        .sort(
          (a, b) =>
            new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
        ),
    [incidents, simulatedIncidents, completedIdSet]
  );

  useEffect(() => {
    if (statusFilter !== "all") setTab(statusFilter);
  }, [statusFilter]);

  const availableIncidentTypes = useMemo(() => {
    const all = [...sortedIncidents, ...fieldIncidents, ...completedIncidents];
    return Array.from(new Set(all.map((i) => i.type).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b)
    );
  }, [sortedIncidents, fieldIncidents, completedIncidents]);

  function withinTimeRange(incident: Incident): boolean {
    if (timeRangeFilter === "all") return true;
    const hours = timeRangeFilter === "1h" ? 1 : timeRangeFilter === "4h" ? 4 : 24;
    const startMs = new Date(incident.startTime).getTime();
    return Date.now() - startMs <= hours * 3_600_000;
  }

  function matchesFilters(incident: Incident, status: FilterTab): boolean {
    if (statusFilter !== "all" && statusFilter !== status) return false;
    if (typeFilter !== "all" && incident.type !== typeFilter) return false;
    if (priorityFilter !== "all" && incident.priority !== Number(priorityFilter)) return false;
    if (!withinTimeRange(incident)) return false;
    const q = searchText.trim().toLowerCase();
    if (!q) return true;
    return (
      incident.type.toLowerCase().includes(q) ||
      incident.address.toLowerCase().includes(q) ||
      incident.incidentId.toLowerCase().includes(q)
    );
  }

  const filteredIncoming = useMemo(
    () => sortedIncidents.filter((i) => matchesFilters(i, "incoming")),
    [sortedIncidents, searchText, typeFilter, priorityFilter, statusFilter, timeRangeFilter]
  );
  const filteredField = useMemo(
    () => fieldIncidents.filter((i) => matchesFilters(i, "field")),
    [fieldIncidents, searchText, typeFilter, priorityFilter, statusFilter, timeRangeFilter]
  );
  const filteredCompleted = useMemo(
    () => completedIncidents.filter((i) => matchesFilters(i, "completed")),
    [completedIncidents, searchText, typeFilter, priorityFilter, statusFilter, timeRangeFilter]
  );

  const badgeCount =
    tab === "incoming" ? filteredIncoming.length :
    tab === "field" ? filteredField.length :
    tab === "completed" ? filteredCompleted.length : 0;

  return (
    <aside className="relative w-96 shrink-0 flex flex-col h-screen bg-gradient-to-b from-[#121726] to-[#0E1320] border-r border-white/[0.10] shadow-[8px_0_24px_rgba(0,0,0,0.35)]">

      {/* ── Field Report Confirmation Modal ─────────────── */}
      {showConfirm && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm rounded-r-none">
          <div className="mx-4 rounded-2xl border border-white/10 bg-[#0F1117] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mic className="w-4 h-4 text-field" />
                <h3 className="font-bold text-white text-sm uppercase tracking-wide">Field Report</h3>
              </div>
              <button onClick={() => setShowConfirm(false)}>
                <X className="w-4 h-4 text-white/30 hover:text-white/60" />
              </button>
            </div>
            <p className="text-xs text-white/50 leading-relaxed">
              You are about to report a new incident via voice. The system will capture your GPS location and transcribe your report automatically.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 rounded-xl py-2.5 text-xs font-bold uppercase tracking-widest border border-white/10 text-white/40 hover:bg-white/[0.04] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleProceedReport}
                className="flex-1 rounded-xl py-2.5 text-xs font-bold uppercase tracking-widest bg-field text-[#03050D] hover:opacity-90 transition-opacity"
              >
                Proceed
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Listening / Processing overlay ──────────────── */}
      {reportingState !== "idle" && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm gap-3">
          <div className="w-14 h-14 rounded-full border-2 border-field flex items-center justify-center animate-pulse">
            <Mic className="w-6 h-6 text-field" />
          </div>
          <p className="font-mono text-xs text-field tracking-widest uppercase">
            {reportingState === "listening" ? "Listening..." : "Processing..."}
          </p>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/[0.10] bg-white/[0.02]">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-field opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-field" />
          </span>
          <h2 className="text-xs font-bold tracking-[0.2em] uppercase text-white/80">
            Live Queue
          </h2>
        </div>

        <div className="flex items-center gap-2">
          {error && (
            <AlertCircle className="w-3.5 h-3.5 text-emergency" aria-label={error} />
          )}
          {loading && (
            <RefreshCw className="w-3.5 h-3.5 text-white/30 animate-spin" />
          )}
          <button
            onClick={() => { setTab("field"); setShowConfirm(true); setReportError(null); }}
            title="Report field incident"
            className="w-6 h-6 rounded-full border border-field/40 flex items-center justify-center hover:bg-field/10 transition-colors"
          >
            <Mic className="w-3 h-3 text-field" />
          </button>
          <Badge variant="default" className="font-mono text-[10px]">
            {badgeCount}
          </Badge>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="px-3 py-2.5 border-b border-white/[0.10] bg-white/[0.02] space-y-2">
        <input
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="Search incident ID, type, address..."
          className="w-full rounded-lg border border-white/10 bg-[#0F1117] px-2.5 py-2 text-xs text-white/85 placeholder:text-white/30 focus:outline-none focus:border-dispatch/40"
        />
        <div className="grid grid-cols-2 gap-2">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-lg border border-white/10 bg-[#0F1117] px-2 py-1.5 text-[11px] text-white/80 focus:outline-none focus:border-dispatch/40"
          >
            <option value="all">Type: All</option>
            {availableIncidentTypes.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as "all" | "1" | "2" | "3")}
            className="rounded-lg border border-white/10 bg-[#0F1117] px-2 py-1.5 text-[11px] text-white/80 focus:outline-none focus:border-dispatch/40"
          >
            <option value="all">Priority: All</option>
            <option value="1">P1</option>
            <option value="2">P2</option>
            <option value="3">P3</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "all" | FilterTab)}
            className="rounded-lg border border-white/10 bg-[#0F1117] px-2 py-1.5 text-[11px] text-white/80 focus:outline-none focus:border-dispatch/40"
          >
            <option value="all">Status: All</option>
            <option value="incoming">Incoming</option>
            <option value="field">Field</option>
            <option value="completed">Completed</option>
          </select>
          <select
            value={timeRangeFilter}
            onChange={(e) => setTimeRangeFilter(e.target.value as "all" | "1h" | "4h" | "24h")}
            className="rounded-lg border border-white/10 bg-[#0F1117] px-2 py-1.5 text-[11px] text-white/80 focus:outline-none focus:border-dispatch/40"
          >
            <option value="all">Time: All</option>
            <option value="1h">Last 1hr</option>
            <option value="4h">Last 4hr</option>
            <option value="24h">Last 24hr</option>
          </select>
        </div>
      </div>

      {/* Filter Tabs */}
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as FilterTab)}
        className="flex flex-col flex-1 min-h-0"
      >
        <TabsList className="rounded-none px-2 pt-2 pb-0 gap-0 bg-transparent border-b border-white/[0.10] flex">
          <TabsTrigger
            value="incoming"
            id={tabIds.incomingTrigger}
            aria-controls={tabIds.incomingPanel}
            className="data-[state=active]:text-emergency data-[state=active]:border-emergency text-[11px] tracking-[0.15em]"
          >
            <span className="flex items-center gap-1.5">
              {/* pulsating 911 dot */}
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emergency opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emergency" />
              </span>
              Incoming Calls
            </span>
          </TabsTrigger>
          <TabsTrigger
            value="field"
            id={tabIds.fieldTrigger}
            aria-controls={tabIds.fieldPanel}
            className="data-[state=active]:text-field data-[state=active]:border-field text-[11px] tracking-[0.15em]"
          >
            Field
          </TabsTrigger>
          <TabsTrigger
            value="completed"
            id={tabIds.completedTrigger}
            aria-controls={tabIds.completedPanel}
            className="data-[state=active]:text-dispatch data-[state=active]:border-dispatch text-[11px] tracking-[0.15em]"
          >
            Completed
            {completedIncidents.length > 0 && (
              <span className="ml-1 font-mono text-[10px] text-dispatch/70">
                {completedIncidents.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Sync status bar */}
        <div className="px-4 py-1.5 border-b border-white/[0.05]">
          {tab === "incoming" ? (
            <span className="font-mono text-[10px] text-white/25">
              SYNC{" "}
              <span className={secondsSinceSync < 5 ? "text-field/60" : "text-white/25"}>
                {secondsSinceSync}s ago
              </span>
            </span>
          ) : (
            <span className="font-mono text-[10px] text-white/20">
              SYNC <span className="text-white/20">DISABLED</span>
            </span>
          )}
        </div>

        {/* Incoming Calls — 911 live + 311 combined */}
        <TabsContent
          value="incoming"
          id={tabIds.incomingPanel}
          aria-labelledby={tabIds.incomingTrigger}
          className="flex-1 min-h-0 mt-0"
        >
          <ScrollArea className="h-full">
            {loading && filteredIncoming.length === 0 ? (
              <LoadingSkeleton />
            ) : filteredIncoming.length === 0 ? (
              <EmptyState color="#FF3D5A" label="No incoming calls" />
            ) : (
              <div className="py-1">
                {filteredIncoming.map((inc) => (
                  <IncidentCard
                    key={inc.id}
                    incident={inc}
                    selected={selectedId === inc.id}
                    onClick={() => onSelect(inc)}
                    nowMs={nowMs}
                  />
                ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>

        {/* Field — officer-reported incidents */}
        <TabsContent
          value="field"
          id={tabIds.fieldPanel}
          aria-labelledby={tabIds.fieldTrigger}
          className="flex-1 min-h-0 mt-0 flex flex-col"
        >
          {reportError && (
            <div className="mx-3 mt-2 px-3 py-2 rounded-lg bg-emergency/10 border border-emergency/20">
              <p className="text-[11px] text-emergency">{reportError}</p>
            </div>
          )}
          {filteredField.length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 gap-3">
              <button
                onClick={() => { setShowConfirm(true); setReportError(null); }}
                className="flex flex-col items-center gap-2 p-4 rounded-2xl border border-field/20 hover:border-field/50 hover:bg-field/5 transition-all"
              >
                <div className="w-10 h-10 rounded-full border border-field/40 flex items-center justify-center">
                  <Mic className="w-4 h-4 text-field" />
                </div>
                <span className="font-mono text-[10px] text-field/70 tracking-widest uppercase">Report Incident</span>
              </button>
              <span className="font-mono text-[10px] text-white/20">No field reports yet</span>
            </div>
          ) : (
            <ScrollArea className="flex-1">
              <div className="py-1">
                {filteredField.map((inc) => (
                  <IncidentCard
                    key={inc.id}
                    incident={inc}
                    selected={selectedId === inc.id}
                    onClick={() => onSelect(inc)}
                    nowMs={nowMs}
                  />
                ))}
              </div>
              <div className="p-3">
                <button
                  onClick={() => { setShowConfirm(true); setReportError(null); }}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-field/20 hover:border-field/40 hover:bg-field/5 transition-all"
                >
                  <Mic className="w-3.5 h-3.5 text-field/60" />
                  <span className="font-mono text-[10px] text-field/60 tracking-widest uppercase">Report New</span>
                </button>
              </div>
            </ScrollArea>
          )}
        </TabsContent>
        {/* Completed — resolved incidents from all sources */}
        <TabsContent
          value="completed"
          id={tabIds.completedPanel}
          aria-labelledby={tabIds.completedTrigger}
          className="flex-1 min-h-0 mt-0"
        >
          {filteredCompleted.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2">
              <CheckCircle2 className="w-6 h-6 text-dispatch/30" />
              <span className="text-xs font-mono text-white/25">No completed incidents</span>
            </div>
          ) : (
            <ScrollArea className="h-full">
              <div className="py-1">
                {filteredCompleted.map((inc) => (
                  <div key={inc.id} className="relative">
                    {/* RESOLVED banner */}
                    <div className="mx-2 mt-1.5 px-3 py-1 rounded-t-md bg-dispatch/10 border border-b-0 border-dispatch/20 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3 h-3 text-dispatch" />
                        <span className="font-mono text-[10px] font-bold text-dispatch tracking-widest uppercase">Resolved</span>
                      </div>
                      <span
                        className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded-sm uppercase"
                        style={{
                          color: inc.source === "911" ? "#FF3D5A" : inc.source === "field" ? "#00E87A" : "#FFAA00",
                          backgroundColor: inc.source === "911" ? "rgba(255,61,90,0.12)" : inc.source === "field" ? "rgba(0,232,122,0.12)" : "rgba(255,170,0,0.12)",
                        }}
                      >
                        {inc.source}
                      </span>
                    </div>
                    <div className="[&>button]:rounded-t-none [&>button]:mt-0 [&>button]:border-dispatch/20">
                      <IncidentCard
                        incident={inc}
                        selected={selectedId === inc.id}
                        onClick={() => onSelect(inc)}
                        nowMs={nowMs}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </TabsContent>

      </Tabs>
    </aside>
  );
}

function LoadingSkeleton() {
  return (
    <div className="divide-y divide-white/[0.05] py-1">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="pl-4 pr-3 py-3 space-y-2 animate-pulse">
          <div className="flex items-center gap-2">
            <div className="w-3.5 h-3.5 rounded-full bg-white/10" />
            <div className="h-3 w-16 rounded bg-white/10" />
            <div className="h-3 w-24 rounded bg-white/10" />
          </div>
          <div className="h-3 w-full rounded bg-white/[0.07] ml-5" />
          <div className="flex justify-between ml-5">
            <div className="h-2 w-32 rounded bg-white/[0.05]" />
            <div className="h-2 w-14 rounded bg-white/[0.05]" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-40 gap-2">
      <AlertCircle className="w-6 h-6" style={{ color }} />
      <span className="text-xs font-mono text-white/25">{label}</span>
    </div>
  );
}
