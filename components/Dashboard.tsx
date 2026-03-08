"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { LiveQueue } from "@/components/LiveQueue";
import { CenterPanel } from "@/components/CenterPanel";
import { CommandCenterBar } from "@/components/CommandCenterBar";
import { SimulateCall } from "@/components/SimulateCall";
import { EventsDrawer } from "@/components/EventsDrawer";
import { ContactsModal } from "@/components/ContactsModal";
import { TodayEventsPanel } from "@/components/TodayEventsPanel";
import { useIncidents } from "@/hooks/useIncidents";

const PatrolHeatmap = dynamic(
  () => import("@/components/PatrolHeatmap").then((m) => m.PatrolHeatmap),
  {
    ssr: false,
    loading: () => (
      <div className="flex-1 min-h-0 flex items-center justify-center bg-[#0F1117]">
        <span className="font-mono text-[10px] text-white/25 tracking-widest uppercase">
          Loading map…
        </span>
      </div>
    ),
  }
);
import type { Incident } from "@/lib/types";

type IncidentLogNote = {
  id: string;
  createdAtMs?: number;
  time: string;
  text: string;
};

const EMPTY_INCIDENT_NOTES: IncidentLogNote[] = [];
const THEME_STORAGE_KEY = "civicguard-theme";
type ThemeMode = "dark" | "light";

export function Dashboard() {
  const { incidents, loading, error, lastUpdated } = useIncidents();
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [fieldIncidents, setFieldIncidents] = useState<Incident[]>([]);
  const [completedIncidents, setCompletedIncidents] = useState<Incident[]>([]);
  const [simulatedIncidents, setSimulatedIncidents] = useState<Incident[]>([]);
  const [incidentNotesById, setIncidentNotesById] = useState<Record<string, IncidentLogNote[]>>({});
  const [simulateOpen, setSimulateOpen] = useState(false);
  const [eventsOpen, setEventsOpen] = useState(false);
  const [contactsOpen, setContactsOpen] = useState(false);
  const [mapMinimized, setMapMinimized] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>("dark");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    const nextTheme: ThemeMode = storedTheme === "light" ? "light" : "dark";
    setTheme(nextTheme);
    document.documentElement.setAttribute("data-theme", nextTheme);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  function handleAddFieldIncident(incident: Incident) {
    setFieldIncidents((prev) => [incident, ...prev]);
    setSelectedIncident(incident);
  }

  function handleComplete(incident: Incident) {
    setCompletedIncidents((prev) =>
      prev.some((c) => c.id === incident.id) ? prev : [incident, ...prev]
    );
  }

  function handleAddSimulated(incident: Incident) {
    setSimulatedIncidents((prev) => [incident, ...prev]);
    setSelectedIncident(incident);
  }

  function handleUpdateIncident(incident: Incident, updates: Partial<Incident>) {
    const updated = { ...incident, ...updates };
    setSelectedIncident(updated);
    setFieldIncidents((prev) => prev.map((i) => (i.id === incident.id ? updated : i)));
    setCompletedIncidents((prev) => prev.map((i) => (i.id === incident.id ? updated : i)));
    setSimulatedIncidents((prev) => prev.map((i) => (i.id === incident.id ? updated : i)));
  }

  const handlePoliceNotesChange = useCallback((incidentId: string, notes: IncidentLogNote[]) => {
    setIncidentNotesById((prev) =>
      prev[incidentId] === notes ? prev : { ...prev, [incidentId]: notes }
    );
  }, []);

  const isCompleted = completedIncidents.some((c) => c.id === selectedIncident?.id);
  const showTicketPanel = !!selectedIncident;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[radial-gradient(ellipse_at_top,#151c2c_0%,#070b15_45%,#03050D_100%)]">
      <LiveQueue
        incidents={incidents}
        simulatedIncidents={simulatedIncidents}
        fieldIncidents={fieldIncidents}
        completedIncidents={completedIncidents}
        loading={loading}
        error={error}
        lastUpdated={lastUpdated}
        selectedId={selectedIncident?.id ?? null}
        onSelect={setSelectedIncident}
        onAddFieldIncident={handleAddFieldIncident}
      />

      <SimulateCall
        open={simulateOpen}
        onClose={() => setSimulateOpen(false)}
        onAddIncoming={handleAddSimulated}
      />

      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <CommandCenterBar
          onOpenCalendar={() => setEventsOpen(true)}
          onOpenContacts={() => setContactsOpen(true)}
          onSimulateCall={() => setSimulateOpen(true)}
          theme={theme}
          onToggleTheme={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
        />

        {showTicketPanel ? (
          <div className="flex-1 min-w-0 overflow-hidden">
            <CenterPanel
              incident={selectedIncident}
              isCompleted={isCompleted}
              onComplete={handleComplete}
              onClose={() => setSelectedIncident(null)}
              onUpdateIncident={handleUpdateIncident}
              initialPoliceNotes={
                selectedIncident
                  ? incidentNotesById[selectedIncident.id] ?? EMPTY_INCIDENT_NOTES
                  : EMPTY_INCIDENT_NOTES
              }
              onPoliceNotesChange={handlePoliceNotesChange}
            />
          </div>
        ) : (
          <div className="flex-1 min-w-0 flex overflow-hidden">
            <div
              className={
                mapMinimized
                  ? "w-14 shrink-0 border-r border-white/[0.10] bg-[#0B0F1A] flex items-start justify-center pt-4"
                  : `flex-1 min-w-0 overflow-hidden flex flex-col transition-all ${eventsOpen ? "blur-[1.5px]" : ""}`
              }
            >
              {simulateOpen ? (
                <div className="flex-1 min-h-0 bg-[#0B0F1A]" />
              ) : mapMinimized ? (
                <button
                  onClick={() => setMapMinimized(false)}
                  className="px-2 py-3 rounded-md border border-white/10 text-white/55 hover:text-white/80 hover:bg-white/[0.06] transition-colors font-mono text-[10px] uppercase tracking-widest [writing-mode:vertical-rl] rotate-180"
                  title="Open map"
                >
                  Open Map
                </button>
              ) : (
                <PatrolHeatmap
                  incidents24h={incidents}
                  inProgressIncidents={[...simulatedIncidents, ...fieldIncidents].filter(
                    (i) => !completedIncidents.some((c) => c.id === i.id)
                  )}
                  onMinimize={() => setMapMinimized(true)}
                />
              )}
            </div>
            <TodayEventsPanel />
          </div>
        )}
      </div>

      <EventsDrawer
        open={eventsOpen}
        onClose={() => setEventsOpen(false)}
      />
      <ContactsModal open={contactsOpen} onClose={() => setContactsOpen(false)} />
    </div>
  );
}
