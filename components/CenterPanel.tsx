"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Incident } from "@/lib/types";
import { INCIDENT_CATEGORIES } from "@/lib/incidentCategories";
import {
  Navigation,
  MapPin,
  AlertTriangle,
  Phone,
  CheckCircle,
  CheckCircle2,
  Mic,
  ExternalLink,
  Shield,
  Clock,
  X,
  PhoneCall,
  Sparkles,
  ThumbsUp,
  ThumbsDown,
  MapPinOff,
  LogOut,
  BellOff,
  Ban,
  FileText,
  Download,
  Bot,
  UserRound,
  ChevronDown,
  ChevronUp,
  Send,
  Info,
} from "lucide-react";

const CLASSIFY_KEYWORDS = ["analyze", "analyse", "classify", "reclassify", "classification"];

const OUTCOMES = [
  { label: "Confirmed", full: "Confirmed Incident",    icon: CheckCircle2, color: "#00E87A", bg: "rgba(0,232,122,0.1)",  border: "rgba(0,232,122,0.3)"  },
  { label: "Unable",    full: "Unable to Locate",      icon: MapPinOff,    color: "#FFAA00", bg: "rgba(255,170,0,0.1)",  border: "rgba(255,170,0,0.3)"  },
  { label: "Gone",      full: "Gone on Arrival",       icon: LogOut,       color: "#00B8FF", bg: "rgba(0,184,255,0.1)",  border: "rgba(0,184,255,0.3)"  },
  { label: "False",     full: "False Alarm",           icon: BellOff,      color: "#FF6B35", bg: "rgba(255,107,53,0.1)", border: "rgba(255,107,53,0.3)" },
  { label: "Unfounded", full: "Unfounded",             icon: Ban,          color: "rgba(255,255,255,0.45)", bg: "rgba(255,255,255,0.05)", border: "rgba(255,255,255,0.12)" },
];

// --- helpers -----------------------------------------------------------

const CITY_TZ = "Etc/GMT+6";
const DEBUG_ANALYSE_DUMMY_MODAL = false;

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: CITY_TZ,
  });
}

function elapsedClock(iso: string, nowMs: number) {
  const diffSec = Math.max(0, Math.floor((nowMs - new Date(iso).getTime()) / 1000));
  const h = String(Math.floor(diffSec / 3600)).padStart(2, "0");
  const m = String(Math.floor((diffSec % 3600) / 60)).padStart(2, "0");
  const s = String(diffSec % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function priorityColor(p?: number): string {
  if (p === 0) return "#FF3D5A";
  if (p === 1) return "#FF6B35";
  if (p === 2) return "#FFAA00";
  if (p === 3) return "#00B8FF";
  if (p === 4) return "#00E87A";
  return "rgba(255,255,255,0.3)";
}

function priorityLabel(p?: number): string {
  if (p === 0) return "CRITICAL";
  if (p === 1) return "HIGH";
  if (p === 2) return "ELEVATED";
  if (p === 3) return "MODERATE";
  if (p === 4) return "LOW";
  return "UNKNOWN";
}

function aiScoreColor(score: number): string {
  if (score >= 71) return "#FF3D5A";
  if (score >= 41) return "#FFAA00";
  return "#00E87A";
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function typeSeverityWeight(type?: string): number {
  const t = (type ?? "").toUpperCase();
  if (!t) return 10;
  if (t.includes("HOMICIDE") || t.includes("MURDER")) return 45;
  if (t.includes("SHOOT") || t.includes("GUN") || t.includes("WEAPON")) return 40;
  if (t.includes("ASSAULT") || t.includes("ROBBERY") || t.includes("KIDNAP")) return 34;
  if (t.includes("THEFT") || t.includes("BURGLARY") || t.includes("LARCENY")) return 26;
  if (t.includes("DRUG") || t.includes("NARCOTIC")) return 22;
  if (t.includes("DISTURBANCE") || t.includes("NUISANCE")) return 16;
  return 14;
}

function prioritySeverityWeight(priority?: number): number {
  if (priority === 0) return 35;
  if (priority === 1) return 28;
  if (priority === 2) return 18;
  if (priority === 3) return 10;
  if (priority === 4) return 4;
  return 8;
}

function elapsedSeverityWeight(iso?: string): number {
  if (!iso) return 0;
  const elapsedHours = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  if (elapsedHours >= 3) return 16;
  if (elapsedHours >= 2) return 12;
  if (elapsedHours >= 1) return 8;
  if (elapsedHours >= 0.5) return 5;
  return 2;
}

function locationHistorySeverityWeight(type?: string): number {
  const t = (type ?? "").toUpperCase();
  // Uses known location-history indicators shown in panel:
  // prior incidents + known offenders + recent activity.
  let weight = 15;
  if (t.includes("ROBBERY") || t.includes("THEFT") || t.includes("BURGLARY")) {
    weight += 6;
  }
  if (t.includes("DRUG") || t.includes("NARCOTIC")) {
    weight += 4;
  }
  if (t.includes("ASSAULT") || t.includes("WEAPON") || t.includes("MURDER")) {
    weight += 6;
  }
  return weight;
}

function computeIncidentSeverityScore(incident?: Incident | null): number {
  if (!incident) return 0;
  const score =
    5 +
    typeSeverityWeight(incident.type) +
    prioritySeverityWeight(incident.priority) +
    locationHistorySeverityWeight(incident.type) +
    elapsedSeverityWeight(incident.startTime);
  return clampScore(score);
}

function navigationQuery(address?: string) {
  const street = (address ?? "").split(",")[0]?.trim() || "Unknown Location";
  return `${street}, Montgomery, AL`;
}

function getCriticalNotes(category?: string, type?: string): string[] {
  const t = (type ?? "").toUpperCase();
  const notes: string[] = [];
  if (t.includes("KNIFE") || t.includes("STAB"))      notes.push("SUSPECT ARMED WITH A KNIFE");
  if (t.includes("GUN") || t.includes("SHOOT") || t.includes("SHOT")) notes.push("SHOTS FIRED — ESTABLISH PERIMETER");
  if (t.includes("WEAPON") || t.includes("ARMED"))    notes.push("SUSPECT MAY BE ARMED — APPROACH WITH CAUTION");
  if (t.includes("VEHICLE") || t.includes("CARJACK")) notes.push("VEHICLE INVOLVED — OBTAIN DESCRIPTION");
  if (t.includes("OVERDOSE"))                         notes.push("POSSIBLE OVERDOSE — REQUEST EMS");
  if (category === "Mental Health" && notes.length === 0) notes.push("MENTAL HEALTH CRISIS — DE-ESCALATION PROTOCOL");
  if (category === "Violent Crime" && notes.length === 0) {
    notes.push("VIOLENT INCIDENT — APPROACH WITH CAUTION");
    notes.push("BACKUP RECOMMENDED");
  }
  return notes;
}

// --- component ---------------------------------------------------------

interface CenterPanelProps {
  incident: Incident | null;
  isCompleted?: boolean;
  onComplete?: (incident: Incident) => void;
  onClose?: () => void;
  onUpdateIncident?: (incident: Incident, updates: Partial<Incident>) => void;
  initialPoliceNotes?: PoliceNote[];
  onPoliceNotesChange?: (incidentId: string, notes: PoliceNote[]) => void;
}

interface PoliceNote {
  id: string;
  createdAtMs?: number;
  time: string;
  text: string;
}

interface IncidentLogEntry {
  id: string;
  createdAtMs: number;
  time: string;
  type: string;
  text: string;
  critical?: boolean;
  police?: boolean;
  caller?: boolean;
}

function createPoliceNote(text: string, time: string): PoliceNote {
  const now = Date.now();
  return {
    id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
    createdAtMs: now + Math.random(),
    time,
    text,
  };
}

interface ClassificationSuggestion {
  incident_type: string;
  priority: number;
  occurrence_timing: "JUST_OCCURRED" | "OCCURRED_EARLIER";
  confidence: number;
  reason?: string;
}

interface ClassificationResult {
  changed?: boolean;
  original_type?: string;
  suggested_type?: string;
  supporting_log?: string;
  recommendation?: string;
  current_incident_type: string;
  top_classification_suggestions: ClassificationSuggestion[];
  incident_type_change_required: boolean;
  key_facts_detected: string[];
  reason: string;
}

interface GeneratedReport {
  incident_summary: string;
  timeline_of_events: string[];
  involved_parties: string[];
  officer_observations: string[];
  recommended_next_steps: string[];
}

interface DispatchAssistantMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAtMs: number;
}

const LOCATION_HISTORY_CONTEXT = [
  "Prior Incident: Armed robbery reported — same block (30 days ago)",
  "Known Offender: Subject J. Doe linked to prior disturbances in area",
  "Recent Activity: 3 calls in past 90 days · Drug-related activity noted",
  "Officer Note: Approach via Oak St — main entrance poorly lit",
];


export function CenterPanel({
  incident,
  isCompleted: isCompletedProp,
  onComplete,
  onClose,
  onUpdateIncident,
  initialPoliceNotes,
  onPoliceNotesChange,
}: CenterPanelProps) {
  const [elapsedTick, setElapsedTick] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [policeNotes, setPoliceNotes] = useState<PoliceNote[]>([]);
  const [showConfirm, setShowConfirm] = useState(false);
  const [completedLocal, setCompletedLocal] = useState(false);
  const completed = completedLocal || (isCompletedProp ?? false);
  const [accepted, setAccepted] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [classification, setClassification] = useState<ClassificationResult | null>(null);
  const [classifying, setClassifying] = useState(false);
  const [classifyError, setClassifyError] = useState<string | null>(null);
  const [classificationDismissed, setClassificationDismissed] = useState(false);
  const [manualIncidentType, setManualIncidentType] = useState<string>("");
  const [openTooltipKey, setOpenTooltipKey] = useState<number | "main" | null>(null);
  const [generatedReport, setGeneratedReport] = useState<GeneratedReport | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportDownloadLoading, setReportDownloadLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState<number | null>(null);
  const [pendingOutcome, setPendingOutcome] = useState<typeof OUTCOMES[number] | null>(null);
  const [confirmedOutcome, setConfirmedOutcome] = useState<string | null>(null);
  const logContainerRef = useRef<HTMLDivElement | null>(null);
  const aiChatContainerRef = useRef<HTMLDivElement | null>(null);
  const [askAiOpen, setAskAiOpen] = useState(false);
  const [aiChatInput, setAiChatInput] = useState("");
  const [aiChatMessages, setAiChatMessages] = useState<DispatchAssistantMessage[]>([]);
  const [aiChatLoading, setAiChatLoading] = useState(false);
  const [aiChatError, setAiChatError] = useState<string | null>(null);

  useEffect(() => {
    setCompletedLocal(false);
    setAccepted(false);
    setPoliceNotes(initialPoliceNotes ?? []);
    setSummary(null);
    setClassification(null);
    setClassificationDismissed(false);
    setClassifyError(null);
    setManualIncidentType("");
    setOpenTooltipKey(null);
    setGeneratedReport(null);
    setShowReportModal(false);
    setReportLoading(false);
    setReportDownloadLoading(false);
    setReportError(null);
    setSelectedSuggestionIndex(null);
    setPendingOutcome(null);
    setConfirmedOutcome(null);
    setAskAiOpen(false);
    setAiChatInput("");
    setAiChatMessages([]);
    setAiChatLoading(false);
    setAiChatError(null);
  }, [incident?.id]);

  useEffect(() => {
    if (!incident?.id || !onPoliceNotesChange) return;
    onPoliceNotesChange(incident.id, policeNotes);
  }, [incident?.id, onPoliceNotesChange, policeNotes]);

  useEffect(() => {
    if (!logContainerRef.current) return;
    logContainerRef.current.scrollTop = 0;
  }, [policeNotes.length, incident?.id]);

  useEffect(() => {
    if (!askAiOpen || !aiChatContainerRef.current) return;
    aiChatContainerRef.current.scrollTop = aiChatContainerRef.current.scrollHeight;
  }, [aiChatMessages.length, aiChatLoading, askAiOpen]);

  useEffect(() => {
    if (!classification) return;
    console.log("Analyse response setState:", {
      changed: classification.changed,
      suggested: classification.suggested_type,
      suggestions: classification.top_classification_suggestions?.length ?? 0,
      dismissed: classificationDismissed,
    });
  }, [classification, classificationDismissed]);

  useEffect(() => {
    const id = setInterval(() => setElapsedTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  function handleRecordVoice() {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Voice recording is not supported in this browser. Please use Chrome.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    setIsRecording(true);
    recognition.start();
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript.trim();
      const lower = transcript.toLowerCase();
      const isCommand = CLASSIFY_KEYWORDS.some((kw) => lower.includes(kw));

      if (isCommand) {
        // Voice command — trigger classification, don't add to log
        setPoliceNotes((current) => {
          fetchClassification(current);
          return current;
        });
      } else {
        const time = new Date().toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          timeZone: CITY_TZ,
        });
        setPoliceNotes((prev) => [createPoliceNote(transcript, time), ...prev]);
      }
      setIsRecording(false);
    };
    recognition.onerror = () => setIsRecording(false);
    recognition.onend = () => setIsRecording(false);
  }

  async function fetchSummary(notes: PoliceNote[]) {
    if (!incident) return;
    setSummarizing(true);
    try {
      const res = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          incidentType: incident.type,
          address: incident.address,
          sector: incident.district ? `Sector ${incident.district}` : "Unassigned",
          policeNotes: notes,
        }),
      });
      const data = await res.json();
      setSummary(data.summary);
    } catch {
      setSummary("Summary generation failed. Please review field notes manually.");
    } finally {
      setSummarizing(false);
    }
  }

  async function handleGenerateReport() {
    if (!incident) return;
    const reportLogEntries = incidentLogEntries.map((log) => ({
      timestamp: log.time,
      source: log.type,
      message: log.text,
    }));
    if (reportLogEntries.length === 0) return;
    setReportLoading(true);
    setReportError(null);
    try {
      const res = await fetch("/api/generate-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          incident: {
            incidentId: incident.incidentId,
            type: incident.type,
            priority: incident.priority,
            address: incident.address,
            district: incident.district,
            source: incident.source,
            startTime: incident.startTime,
          },
          logEntries: reportLogEntries,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setReportError(data.error ?? "Report generation failed.");
        return;
      }
      const normalized: GeneratedReport = {
        incident_summary:
          typeof data.incident_summary === "string"
            ? data.incident_summary
            : "Not established from logs",
        timeline_of_events: Array.isArray(data.timeline_of_events)
          ? data.timeline_of_events.map((x: unknown) => String(x))
          : [],
        involved_parties: Array.isArray(data.involved_parties)
          ? data.involved_parties.map((x: unknown) => String(x))
          : [],
        officer_observations: Array.isArray(data.officer_observations)
          ? data.officer_observations.map((x: unknown) => String(x))
          : [],
        recommended_next_steps: Array.isArray(data.recommended_next_steps)
          ? data.recommended_next_steps.map((x: unknown) => String(x))
          : [],
      };
      setGeneratedReport(normalized);
      setShowReportModal(true);
    } catch (err) {
      console.error("generate report failed:", err);
      setReportError("Report generation failed.");
    } finally {
      setReportLoading(false);
    }
  }

  async function handleDownloadReportPdf() {
    if (!incident || !generatedReport) return;
    setReportDownloadLoading(true);
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const width = doc.internal.pageSize.getWidth();
      const margin = 40;
      let y = 48;

      const addSection = (title: string, lines: string[]) => {
        if (y > 740) {
          doc.addPage();
          y = 48;
        }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.text(title, margin, y);
        y += 18;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        const text = lines.length > 0 ? lines.join("\n") : "Not established from logs";
        const wrapped = doc.splitTextToSize(text, width - margin * 2);
        doc.text(wrapped, margin, y);
        y += wrapped.length * 13 + 14;
      };

      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text(`Incident Report - ${incident.incidentId}`, margin, y);
      y += 20;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(`Type: ${incident.type}`, margin, y);
      y += 14;
      doc.text(`Priority: ${incident.priority ?? "Unknown"} | Source: ${incident.source}`, margin, y);
      y += 14;
      doc.text(`Address: ${incident.address}`, margin, y);
      y += 22;

      addSection("Incident Summary", [generatedReport.incident_summary]);
      addSection("Timeline of Events", generatedReport.timeline_of_events);
      addSection("Involved Parties", generatedReport.involved_parties);
      addSection("Officer Observations", generatedReport.officer_observations);
      addSection("Recommended Next Steps", generatedReport.recommended_next_steps);

      doc.save(`${incident.incidentId}-report.pdf`);
    } finally {
      setReportDownloadLoading(false);
    }
  }

  async function handleAskDispatchAssistant() {
    if (!incident) return;
    const userQuestion = aiChatInput.trim();
    if (!userQuestion || aiChatLoading) return;

    const userMsg: DispatchAssistantMessage = {
      id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      role: "user",
      content: userQuestion,
      createdAtMs: Date.now(),
    };

    const conversationHistory = aiChatMessages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    const payload = {
      incident: {
        incidentId: incident.incidentId,
        type: incident.type,
        address: incident.address,
        priority: incident.priority,
        locationHistory: LOCATION_HISTORY_CONTEXT,
      },
      logEntries: incidentLogEntries.map((log) => ({
        timestamp: log.time,
        source: log.type,
        message: log.text,
      })),
      conversationHistory,
      userQuestion,
    };

    setAiChatInput("");
    setAiChatError(null);
    setAiChatMessages((prev) => [...prev, userMsg]);
    setAiChatLoading(true);

    try {
      const res = await fetch("/api/dispatch-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setAiChatError(data.error ?? "Dispatch assistant unavailable.");
        return;
      }
      const assistantMsg: DispatchAssistantMessage = {
        id: `assistant-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        role: "assistant",
        content: String(data.answer ?? "").trim() || "No response generated.",
        createdAtMs: Date.now(),
      };
      setAiChatMessages((prev) => [...prev, assistantMsg]);
    } catch {
      setAiChatError("Dispatch assistant unavailable.");
    } finally {
      setAiChatLoading(false);
    }
  }

  function buildClassificationNotes(notes: PoliceNote[]): {
    timestamp: string;
    source: string;
    message: string;
  }[] {
    if (!incident) {
      return notes.map((note) => ({
        timestamp: note.time,
        source: "Officer",
        message: note.text,
      }));
    }
    const baseMs = new Date(incident.startTime).getTime();
    const seedNotes = [
      {
        timestamp: formatTime(incident.startTime),
        source: "CAD",
        message: `${incident.incidentId} initially tagged as ${incident.type} at ${incident.address}.`,
      },
      {
        timestamp: formatTime(new Date(baseMs + 60_000).toISOString()),
        source: "Dispatch",
        message: "Unit status check pending. Validate incident type with all available logs.",
      },
    ];
    if (incident.callNotes?.length) {
      incident.callNotes.forEach((note, idx) => {
        seedNotes.push({
          timestamp: formatTime(new Date(baseMs + 30_000 + idx * 15_000).toISOString()),
          source: "Caller",
          message: note,
        });
      });
    }
    return [
      ...seedNotes,
      ...notes.map((note) => ({
        timestamp: note.time,
        source: "Officer",
        message: note.text,
      })),
    ];
  }

  async function fetchClassification(notes: PoliceNote[] = policeNotes) {
    if (!incident) return;
    const incidentLogs =
      incidentLogEntries.length > 0
        ? incidentLogEntries.map((log) => ({
            timestamp: log.time,
            source: log.type,
            message: log.text,
          }))
        : buildClassificationNotes(notes);
    if (incidentLogs.length === 0) return;
    console.log("Analyse request payload:", {
      currentIncidentType: incident.type,
      logEntries: incidentLogs.length,
    });
    setClassifying(true);
    setClassifyError(null);
    setClassificationDismissed(false);
    setSelectedSuggestionIndex(null);
    try {
      const res = await fetch("/api/classify-incident", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentIncidentType: incident.type,
          logEntries: incidentLogs,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setClassifyError(data.error ?? "Analysis failed. Please try again.");
        return;
      }
      console.log("Analyse API response:", data);
      if (!data.error) {
        const normalizedSuggestions = Array.isArray(data.top_classification_suggestions)
          ? data.top_classification_suggestions.slice(0, 2).map((s: ClassificationSuggestion) => ({
              ...s,
              priority:
                typeof s.priority === "number"
                  ? Math.max(0, Math.min(4, Math.round(s.priority)))
                  : 2,
            }))
          : [];
        const nextClassification: ClassificationResult = {
          ...data,
          top_classification_suggestions: normalizedSuggestions,
          key_facts_detected: Array.isArray(data.key_facts_detected) ? data.key_facts_detected : [],
          incident_type_change_required: data.incident_type_change_required ?? data.changed ?? false,
          current_incident_type: data.current_incident_type ?? data.original_type ?? "",
        };
        setClassification(nextClassification);
      }
    } catch (err) {
      console.error("fetchClassification failed:", err);
      setClassifyError("Analysis failed. Please try again.");
    } finally {
      setClassifying(false);
    }
  }

  async function handleConfirmComplete() {
    if (!incident) return;
    setShowConfirm(false);
    setCompletedLocal(true);
    if (onComplete) onComplete(incident);
    const time = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: CITY_TZ });
    setPoliceNotes((prev) => [
      createPoliceNote("Incident marked as completed", time),
      ...prev,
    ]);
    // Trigger both classification and summary on completion
    await fetchClassification();
    await fetchSummary(policeNotes);
  }

  // Re-generate summary whenever a new voice note is added after completion
  useEffect(() => {
    if (completed && policeNotes.length > 0) {
      fetchSummary(policeNotes);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [policeNotes]);


  const criticalNotes = getCriticalNotes(incident?.aiCategory, incident?.type);
  const baseWeight = 5;
  const typeWeight = typeSeverityWeight(incident?.type);
  const priorityWeight = prioritySeverityWeight(incident?.priority);
  const locationHistoryWeight = locationHistorySeverityWeight(incident?.type);
  const elapsedWeight = elapsedSeverityWeight(incident?.startTime);
  const headerAiScore = clampScore(
    baseWeight + typeWeight + priorityWeight + locationHistoryWeight + elapsedWeight
  );
  const aiScoreBreakdownTooltip =
    `AI Severity Score (0-100)\n` +
    `Base: ${baseWeight}\n` +
    `Type: ${typeWeight}\n` +
    `Priority: ${priorityWeight}\n` +
    `Location history: ${locationHistoryWeight}\n` +
    `Elapsed: ${elapsedWeight}\n` +
    `Total: ${headerAiScore}`;
  const isCritical = headerAiScore >= 71 || (incident?.priority !== undefined && incident.priority <= 1);
  const nowMs = Date.now() + elapsedTick * 0;
  const orderedPoliceNotes = [...policeNotes].sort((a, b) => {
    const byCreatedAt = (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0);
    if (byCreatedAt !== 0) return byCreatedAt;
    return b.id.localeCompare(a.id);
  });
  const incidentLogEntries = useMemo<IncidentLogEntry[]>(() => {
    if (!incident) return [];
    const startMs = new Date(incident.startTime).getTime();
    const entries: IncidentLogEntry[] = [
      {
        id: `${incident.id}-cad`,
        createdAtMs: startMs,
        time: formatTime(incident.startTime),
        type: "CAD",
        text: `${incident.incidentId} — ${incident.type}`,
      },
      {
        id: `${incident.id}-dispatch`,
        createdAtMs: startMs + 60_000,
        time: formatTime(new Date(startMs + 60_000).toISOString()),
        type: "Dispatch",
        text: "Received. Awaiting unit.",
      },
    ];
    if (incident.callNotes?.length) {
      entries.push({
        id: `${incident.id}-alert`,
        createdAtMs: startMs + 30_000,
        time: formatTime(new Date(startMs + 30_000).toISOString()),
        type: "Alert",
        text: "SIMULATED CALL RECEIVED — Review caller details and respond accordingly.",
        critical: true,
      });
      incident.callNotes.forEach((note, i) => {
        entries.push({
          id: `${incident.id}-caller-${i}`,
          createdAtMs: startMs + 30_000 + i * 1000,
          time: formatTime(incident.startTime),
          type: "Caller",
          text: note,
          caller: true,
        });
      });
    } else if (isCritical) {
      entries.push({
        id: `${incident.id}-priority-alert`,
        createdAtMs: startMs + 90_000,
        time: formatTime(new Date(startMs + 90_000).toISOString()),
        type: "Alert",
        text: "HIGH PRIORITY — Respond immediately.",
        critical: true,
      });
    }
    orderedPoliceNotes.forEach((note) => {
      entries.push({
        id: note.id,
        createdAtMs: note.createdAtMs ?? startMs,
        time: note.time,
        type: "Officer",
        text: note.text,
        police: true,
      });
    });
    return entries.sort((a, b) => b.createdAtMs - a.createdAtMs);
  }, [incident, isCritical, orderedPoliceNotes]);
  const topSuggestion = classification?.top_classification_suggestions?.[0];
  const priorityChangeRequired =
    typeof incident?.priority === "number" &&
    typeof topSuggestion?.priority === "number" &&
    incident.priority !== topSuggestion.priority;

  return (
    <main className="flex flex-col h-full min-h-0 overflow-hidden bg-gradient-to-b from-[#050812] via-[#04070F] to-[#03050D] relative">

      {/* ── Confirm Complete Modal ───────────────────────── */}
      {showConfirm && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm">
          <div className="rounded-2xl border border-white/10 bg-[#0F1117] p-6 max-w-sm w-full mx-4 space-y-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-emergency shrink-0" />
              <h3 className="font-bold text-white text-sm tracking-wide uppercase">Confirm Completion</h3>
            </div>
            <p className="text-sm text-white/55 leading-relaxed">
              This action <span className="text-white/80 font-semibold">cannot be reverted</span>. All actions will be locked and an operational summary will be generated.
            </p>
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 rounded-xl py-3 text-sm font-bold uppercase tracking-widest border border-white/10 text-white/40 hover:bg-white/[0.04] transition-colors"
              >Cancel</button>
              <button
                onClick={handleConfirmComplete}
                className="flex-1 rounded-xl py-3 text-sm font-bold uppercase tracking-widest bg-emergency text-white hover:opacity-90 transition-opacity"
              >Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Outcome Confirm Modal ────────────────────────── */}
      {pendingOutcome && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm">
          <div className="rounded-2xl border border-white/10 bg-[#0F1117] p-6 max-w-sm w-full mx-4 space-y-4">
            <div className="flex items-center gap-3">
              <pendingOutcome.icon className="w-5 h-5 shrink-0" style={{ color: pendingOutcome.color }} />
              <h3 className="font-bold text-white text-sm tracking-wide uppercase">Confirm Outcome</h3>
            </div>
            <p className="text-sm text-white/55 leading-relaxed">
              Set outcome to{" "}
              <span className="font-semibold" style={{ color: pendingOutcome.color }}>{pendingOutcome.full}</span>?
              This will be recorded in the incident log.
            </p>
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setPendingOutcome(null)}
                className="flex-1 rounded-xl py-3 text-sm font-bold uppercase tracking-widest border border-white/10 text-white/40 hover:bg-white/[0.04] transition-colors"
              >Cancel</button>
              <button
                onClick={() => {
                  const time = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: CITY_TZ });
                  setPoliceNotes((prev) => [
                    createPoliceNote(`Outcome recorded: ${pendingOutcome.full}`, time),
                    ...prev,
                  ]);
                  setConfirmedOutcome(pendingOutcome.full);
                  setPendingOutcome(null);
                }}
                className="flex-1 rounded-xl py-3 text-sm font-bold uppercase tracking-widest text-[#03050D] hover:opacity-90 transition-opacity"
                style={{ backgroundColor: pendingOutcome.color }}
              >Confirm</button>
            </div>
          </div>
        </div>
      )}


      {showReportModal && generatedReport && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-3xl max-h-[85vh] overflow-hidden rounded-2xl border border-dispatch/30 bg-[#0F1117] flex flex-col">
            <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
              <div>
                <p className="font-mono text-xs tracking-widest uppercase text-dispatch">Generated Police Report</p>
                <p className="text-xs text-white/45">#{incident?.incidentId} · {incident?.type}</p>
              </div>
              <button
                onClick={() => setShowReportModal(false)}
                className="text-white/40 hover:text-white/70 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-4 text-sm">
              <section>
                <p className="font-mono text-[11px] text-white/45 uppercase tracking-widest mb-1">Incident Summary</p>
                <p className="text-white/80 leading-relaxed">{generatedReport.incident_summary}</p>
              </section>

              <section>
                <p className="font-mono text-[11px] text-white/45 uppercase tracking-widest mb-1">Timeline of Events</p>
                <ul className="space-y-1 text-white/75">
                  {generatedReport.timeline_of_events.length > 0 ? generatedReport.timeline_of_events.map((item, idx) => (
                    <li key={`timeline-${idx}`}>- {item}</li>
                  )) : <li>- Not established from logs</li>}
                </ul>
              </section>

              <section>
                <p className="font-mono text-[11px] text-white/45 uppercase tracking-widest mb-1">Involved Parties</p>
                <ul className="space-y-1 text-white/75">
                  {generatedReport.involved_parties.length > 0 ? generatedReport.involved_parties.map((item, idx) => (
                    <li key={`party-${idx}`}>- {item}</li>
                  )) : <li>- Not established from logs</li>}
                </ul>
              </section>

              <section>
                <p className="font-mono text-[11px] text-white/45 uppercase tracking-widest mb-1">Officer Observations</p>
                <ul className="space-y-1 text-white/75">
                  {generatedReport.officer_observations.length > 0 ? generatedReport.officer_observations.map((item, idx) => (
                    <li key={`obs-${idx}`}>- {item}</li>
                  )) : <li>- Not established from logs</li>}
                </ul>
              </section>

              <section>
                <p className="font-mono text-[11px] text-white/45 uppercase tracking-widest mb-1">Recommended Next Steps</p>
                <ul className="space-y-1 text-white/75">
                  {generatedReport.recommended_next_steps.length > 0 ? generatedReport.recommended_next_steps.map((item, idx) => (
                    <li key={`step-${idx}`}>- {item}</li>
                  )) : <li>- Not established from logs</li>}
                </ul>
              </section>
            </div>

            <div className="px-4 py-3 border-t border-white/10 flex justify-end">
              <button
                onClick={handleDownloadReportPdf}
                disabled={reportDownloadLoading}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-dispatch/25 bg-dispatch/10 text-dispatch hover:bg-dispatch/20 transition-colors font-mono text-[10px] uppercase tracking-widest disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Download className="w-3.5 h-3.5" />
                {reportDownloadLoading ? "Preparing PDF..." : "Download as PDF"}
              </button>
            </div>
          </div>
        </div>
      )}

      {incident ? (
        <>
          {/* ── Incident header ─ sticky ────────────────── */}
          <div className="shrink-0 sticky top-0 z-10 bg-[#03050D]/95 backdrop-blur-sm border-b border-white/[0.08]">
            <div className="flex items-start justify-between gap-3 px-5 py-4">

              {/* LEFT: Close · ID · badges · elapsed · type */}
              <div className="flex flex-col gap-2 min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  {onClose && (
                    <button
                      onClick={onClose}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/10 text-white/45 hover:text-white/75 hover:border-white/25 hover:bg-white/[0.06] transition-colors shrink-0"
                      title="Close incident"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span className="font-mono text-[10px] tracking-widest">CLOSE</span>
                    </button>
                  )}
                  <span className="font-mono text-sm font-bold text-white/55 tracking-widest shrink-0">
                    #{incident.incidentId}
                  </span>
                  {incident.priority !== undefined && (
                    <span className="flex items-center gap-1.5 font-mono text-xs font-bold px-2.5 py-1 rounded-sm shrink-0 border border-white/10 bg-white/[0.03]">
                      <AlertTriangle
                        className="w-3.5 h-3.5 shrink-0"
                        style={{ color: priorityColor(incident.priority) }}
                      />
                      <span style={{ color: priorityColor(incident.priority) }}>P{incident.priority}</span>
                      <span className="text-white/45 text-[10px]">{priorityLabel(incident.priority)}</span>
                    </span>
                  )}
                  {incident && (
                    <span
                      className="font-mono text-xs font-bold px-2.5 py-1 rounded-sm shrink-0 cursor-help"
                      style={{ backgroundColor: aiScoreColor(headerAiScore), color: "#03050D" }}
                      title={aiScoreBreakdownTooltip}
                    >
                      AI {headerAiScore}
                    </span>
                  )}
                  <span className="font-mono text-xs text-white/40 shrink-0">
                    ELAPSED {elapsedClock(incident.startTime, nowMs)}
                  </span>
                </div>
                <h2 className="text-base font-bold text-white uppercase leading-snug tracking-wide break-words">
                  {incident.type}
                </h2>
              </div>

              {/* RIGHT: via badge + caller */}
              <div className="flex flex-col items-end gap-2 shrink-0">
                <span
                  className="shrink-0 font-mono text-sm font-bold px-3 py-1 rounded-sm uppercase"
                  style={{
                    color: incident.source === "911" ? "#FF3D5A" : incident.source === "field" ? "#00E87A" : "#FFAA00",
                    backgroundColor: incident.source === "911" ? "rgba(255,61,90,0.12)" : incident.source === "field" ? "rgba(0,232,122,0.12)" : "rgba(255,170,0,0.12)",
                  }}
                >
                  via {incident.source}
                </span>
                <a
                  href="tel:+13015550192"
                  className="flex items-center gap-2 rounded-lg px-3 py-1.5 transition-all active:scale-95 hover:opacity-90"
                  style={{ backgroundColor: "rgba(0,232,122,0.08)", border: "1px solid rgba(0,232,122,0.25)" }}
                >
                  <Phone className="w-3.5 h-3.5 text-field shrink-0" />
                  <span className="font-mono text-xs font-bold text-field">J. Doe · +1 (301) 555-0192</span>
                </a>
              </div>

            </div>
          </div>

          {/* ── Body — fixed; only log panel scrolls ─────── */}
          <div className="flex-1 min-h-0 overflow-hidden pb-3">
            <div className="h-full p-4">

              {/* ── Two-column body ──────────────────────── */}
              <div className="h-full flex gap-3 items-stretch">

                {/* ── LEFT: Map + Accept + Backup ─────── */}
                <div className="flex flex-col gap-2.5 w-[48%] shrink-0">

                  {/* Map */}
                  <div
                    className="rounded-xl overflow-hidden border border-white/[0.08] relative bg-[#0d0608]"
                    style={{ height: "150px" }}
                  >
                    <div
                      className="absolute inset-0"
                      style={{
                        backgroundImage: `linear-gradient(rgba(255,61,90,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,61,90,0.06) 1px, transparent 1px)`,
                        backgroundSize: "24px 24px",
                      }}
                    />
                    <div
                      className="absolute inset-0"
                      style={{ background: "radial-gradient(ellipse 60% 60% at 50% 50%, rgba(255,61,90,0.09) 0%, transparent 70%)" }}
                    />
                    <div className="relative z-[1] h-full p-4 flex flex-col gap-2">
                      {/* Row 1: address text with pin icon */}
                      <div className="flex items-start gap-1.5 bg-[#0d0608]/90 border border-white/10 px-2 py-1 rounded-md">
                        <MapPin className="w-2.5 h-2.5 text-emergency shrink-0 mt-0.5" />
                        <span className="text-sm text-white/80 font-bold break-words leading-snug">
                          {incident.address}
                        </span>
                      </div>

                      {/* Row 2: NAVIGATE button centered */}
                      <div className="flex justify-center">
                        {incident.address ? (
                          <a
                            href={`https://www.google.com/maps?q=${encodeURIComponent(navigationQuery(incident.address))}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex w-fit items-center gap-2 bg-emergency text-white text-[10px] font-bold tracking-[0.12em] uppercase px-4 py-2 rounded-full hover:opacity-90 transition-opacity active:scale-95"
                            style={{ boxShadow: "0 0 20px rgba(255,61,90,0.4)" }}
                          >
                            <Navigation className="w-3 h-3 fill-white" />
                            NAVIGATE
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        ) : (
                          <span className="border border-white/10 text-white/25 text-[10px] font-bold uppercase px-4 py-1.5 rounded-full">
                            NO ADDRESS DATA
                          </span>
                        )}
                      </div>

                      {/* Row 3: timestamp right-aligned */}
                      <div className="mt-auto flex items-center gap-1 self-end bg-[#0d0608]/80 px-1.5 py-0.5 rounded-sm">
                        <Clock className="w-2.5 h-2.5 text-white/25" />
                        <span className="font-mono text-[9px] text-white/35">{formatTime(incident.startTime)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Accept Task */}
                  <button
                    disabled={completed || accepted}
                    onClick={() => {
                      setAccepted(true);
                      const time = new Date().toLocaleTimeString("en-US", {
                        hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: CITY_TZ,
                      });
                      setPoliceNotes((prev) => [
                        createPoliceNote("Task accepted — Sergeant XXX / Unit 111 en route.", time),
                        ...prev,
                      ]);
                    }}
                    className="w-full flex items-center justify-center gap-2 rounded-xl py-3.5 font-bold text-[11px] tracking-[0.12em] uppercase transition-all active:scale-95"
                    style={{
                      backgroundColor: accepted || completed ? "rgba(255,255,255,0.04)" : "#FF3D5A",
                      color: accepted || completed ? "rgba(255,255,255,0.25)" : "white",
                      border: accepted || completed ? "1px solid rgba(255,255,255,0.07)" : "none",
                      cursor: accepted || completed ? "not-allowed" : "pointer",
                      boxShadow: accepted || completed ? "none" : "0 0 18px rgba(255,61,90,0.25)",
                    }}
                  >
                    <Shield className="w-4 h-4" />
                    {accepted ? "TASK ACCEPTED" : "ACCEPT TASK"}
                  </button>

                  {/* Request Backup */}
                  <button
                    disabled={completed}
                    onClick={() => {
                      const time = new Date().toLocaleTimeString("en-US", {
                        hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: CITY_TZ,
                      });
                      setPoliceNotes((prev) => [
                        createPoliceNote("Backup requested — awaiting additional unit.", time),
                        ...prev,
                      ]);
                    }}
                    className="w-full flex items-center justify-center gap-2 rounded-xl py-3.5 font-bold text-[11px] tracking-[0.12em] uppercase border transition-all active:scale-95"
                    style={{
                      backgroundColor: "rgba(0,184,255,0.07)",
                      borderColor: completed ? "rgba(0,184,255,0.1)" : "rgba(0,184,255,0.3)",
                      color: completed ? "rgba(255,255,255,0.2)" : "#00B8FF",
                      cursor: completed ? "not-allowed" : "pointer",
                    }}
                  >
                    <PhoneCall className="w-4 h-4" />
                    REQ. BACKUP
                  </button>

                  {/* Patrol unit card — shown once accepted */}
                  {accepted && (
                    <div
                      className="rounded-xl border px-3 py-2.5 space-y-2"
                      style={{ borderColor: "rgba(0,232,122,0.2)", backgroundColor: "rgba(0,232,122,0.05)" }}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-field animate-pulse shrink-0" />
                        <p className="font-mono text-[11px] font-bold text-field tracking-widest uppercase">Patrol Unit</p>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-field/10 border border-field/20 flex items-center justify-center shrink-0">
                          <Shield className="w-3.5 h-3.5 text-field" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-white/80">Sergeant XXX</p>
                          <p className="font-mono text-xs text-white/40">Unit 111</p>
                        </div>
                        <span className="ml-auto font-mono text-[10px] font-bold text-field/70 border border-field/20 px-1.5 py-0.5 rounded-sm">
                          EN ROUTE
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Location History */}
                  <div
                    className="rounded-xl border px-3 py-2.5 space-y-2.5"
                    style={{ borderColor: "rgba(255,170,0,0.18)", backgroundColor: "rgba(255,170,0,0.04)" }}
                  >
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3 h-3 text-civic shrink-0" />
                      <p className="font-mono text-[11px] font-bold text-civic tracking-widest uppercase">Location History</p>
                    </div>
                    <div className="space-y-2">
                      <LocationHistoryEntry
                        label="Prior Incident"
                        detail="Armed robbery reported — same block (30 days ago)"
                        color="#FF3D5A"
                      />
                      <LocationHistoryEntry
                        label="Known Offender"
                        detail="Subject J. Doe linked to prior disturbances in area"
                        color="#FFAA00"
                      />
                      <LocationHistoryEntry
                        label="Recent Activity"
                        detail="3 calls in past 90 days · Drug-related activity noted"
                        color="#B06DFF"
                      />
                      <LocationHistoryEntry
                        label="Officer Note"
                        detail="Approach via Oak St — main entrance poorly lit"
                        color="#00B8FF"
                      />
                    </div>
                  </div>
                </div>

                {/* ── RIGHT: Incident Log ─────────────── */}
                <div className="flex-1 flex flex-col gap-2.5 min-w-0 min-h-0">

                  {/* AI Classification Widget */}
                  {(classifying || (classification && !classificationDismissed)) && (
                    <div
                      className="rounded-xl border p-3 space-y-2.5"
                      style={{ borderColor: "rgba(176,109,255,0.3)", backgroundColor: "rgba(176,109,255,0.05)" }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-ai" />
                          <span className="font-mono text-xs font-bold text-ai tracking-[0.15em] uppercase">AI Classification</span>
                          {!classifying && classification && (
                            <button
                              onClick={() => setOpenTooltipKey(openTooltipKey === "main" ? null : "main")}
                              className="text-white/25 hover:text-ai/60 transition-colors"
                              title="Show reasoning"
                            >
                              <Info className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                        {!classifying && (
                          <button
                            onClick={() => { setClassificationDismissed(true); setOpenTooltipKey(null); }}
                            className="text-white/20 hover:text-white/50 transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {classifying ? (
                        <p className="text-xs text-white/30 animate-pulse font-mono">Analysing log entries…</p>
                      ) : classification && (
                        <>
                          {/* Main reason tooltip */}
                          {openTooltipKey === "main" && (
                            <div className="rounded-lg border border-ai/20 bg-[#0a0c14] p-2.5 space-y-1.5">
                              <p className="text-[11px] text-white/60 leading-relaxed italic">{classification.reason}</p>
                              {classification.supporting_log ? (
                                <p className="text-[11px] text-white/50 leading-relaxed">
                                  <span className="text-white/30">Supporting log:</span> {classification.supporting_log}
                                </p>
                              ) : null}
                              {classification.recommendation ? (
                                <p className="text-[11px] text-ai/70 leading-relaxed">{classification.recommendation}</p>
                              ) : null}
                            </div>
                          )}

                          {/* Change required banner */}
                          {classification.incident_type_change_required && (
                            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-emergency/10 border border-emergency/20">
                              <AlertTriangle className="w-3 h-3 text-emergency shrink-0" />
                              <span className="font-mono text-[10px] font-bold text-emergency uppercase tracking-wide">
                                Reclassification recommended
                              </span>
                            </div>
                          )}
                          {priorityChangeRequired && (
                            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-[#FFAA00]/10 border border-[#FFAA00]/30">
                              <AlertTriangle className="w-3 h-3 text-[#FFAA00] shrink-0" />
                              <span className="font-mono text-[10px] font-bold text-[#FFAA00] uppercase tracking-wide">
                                Priority update recommended (P{incident?.priority} to P{topSuggestion?.priority})
                              </span>
                            </div>
                          )}

                          {/* Top 2 classification suggestions */}
                          <div className="space-y-2">
                            {classification.top_classification_suggestions.map((s, i) => (
                              <div key={i} className="space-y-0">
                                <div
                                  role="button"
                                  tabIndex={0}
                                  onClick={() => setSelectedSuggestionIndex(i)}
                                  onKeyDown={(e) => e.key === "Enter" && setSelectedSuggestionIndex(i)}
                                  className="w-full text-left space-y-1 rounded-lg border p-2 cursor-pointer transition-colors hover:bg-white/[0.03]"
                                  style={{
                                    borderColor:
                                      selectedSuggestionIndex === i
                                        ? "rgba(176,109,255,0.45)"
                                        : "rgba(255,255,255,0.08)",
                                    backgroundColor:
                                      selectedSuggestionIndex === i
                                        ? "rgba(176,109,255,0.08)"
                                        : "transparent",
                                  }}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      <span
                                        className="font-mono text-[10px] font-bold shrink-0 px-1.5 py-0.5 rounded-sm"
                                        style={{
                                          backgroundColor: i === 0 ? "rgba(176,109,255,0.2)" : "rgba(255,255,255,0.06)",
                                          color: i === 0 ? "#B06DFF" : "rgba(255,255,255,0.4)",
                                        }}
                                      >
                                        #{i + 1}
                                      </span>
                                      <span className="text-xs font-bold text-white/80 truncate">{s.incident_type}</span>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                      <span
                                        className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded-sm border"
                                        style={{
                                          color: priorityColor(s.priority),
                                          borderColor: `${priorityColor(s.priority)}66`,
                                          backgroundColor: `${priorityColor(s.priority)}1A`,
                                        }}
                                      >
                                        P{s.priority} {priorityLabel(s.priority)}
                                      </span>
                                      <span className="font-mono text-[10px] text-white/35">{s.occurrence_timing.replace("_", " ")}</span>
                                      <span
                                        className="font-mono text-xs font-bold"
                                        style={{ color: s.confidence >= 80 ? "#FF3D5A" : s.confidence >= 50 ? "#FFAA00" : "#00E87A" }}
                                      >
                                        {s.confidence}%
                                      </span>
                                      {s.reason && (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setOpenTooltipKey(openTooltipKey === i ? null : i);
                                          }}
                                          className="text-white/25 hover:text-ai/60 transition-colors shrink-0"
                                          title="Show reason"
                                        >
                                          <Info className="w-3 h-3" />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                  {/* Confidence bar */}
                                  <div className="h-1 rounded-full bg-white/[0.07] overflow-hidden">
                                    <div
                                      className="h-full rounded-full transition-all duration-500"
                                      style={{
                                        width: `${s.confidence}%`,
                                        backgroundColor: s.confidence >= 80 ? "#FF3D5A" : s.confidence >= 50 ? "#FFAA00" : "#00E87A",
                                      }}
                                    />
                                  </div>
                                </div>
                                {/* Per-suggestion reason tooltip */}
                                {openTooltipKey === i && s.reason && (
                                  <div className="rounded-b-lg border-x border-b border-ai/20 bg-[#0a0c14] px-2.5 py-2">
                                    <p className="text-[11px] text-white/55 leading-relaxed">{s.reason}</p>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>

                          {/* Manual override dropdown */}
                          <div className="space-y-1 pt-0.5">
                            <p className="font-mono text-[10px] text-white/30 uppercase tracking-widest">Or choose manually</p>
                            <select
                              value={manualIncidentType}
                              onChange={(e) => {
                                setManualIncidentType(e.target.value);
                                setSelectedSuggestionIndex(null);
                              }}
                              className="w-full rounded-lg border border-white/10 bg-[#0a0c14] text-white/70 text-xs px-2.5 py-1.5 font-mono focus:outline-none focus:border-ai/40"
                            >
                              <option value="">— Select incident type —</option>
                              {INCIDENT_CATEGORIES.map((cat) => (
                                <option key={cat} value={cat}>{cat}</option>
                              ))}
                            </select>
                          </div>

                          {/* Apply / Ignore */}
                          <div className="flex gap-2 pt-0.5">
                            <button
                              onClick={() => {
                                setClassificationDismissed(true);
                                setManualIncidentType("");
                              }}
                              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-white/[0.08] text-white/35 hover:text-white/55 hover:bg-white/[0.03] transition-colors font-mono text-[10px] uppercase tracking-widest"
                            >
                              <ThumbsDown className="w-3 h-3" />
                              Ignore
                            </button>
                            <button
                              disabled={selectedSuggestionIndex === null && !manualIncidentType}
                              onClick={() => {
                                if (!incident) return;
                                const time = new Date().toLocaleTimeString("en-US", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  second: "2-digit",
                                  timeZone: CITY_TZ,
                                });
                                if (manualIncidentType) {
                                  setPoliceNotes((prev) => [
                                    createPoliceNote(`Classification applied: ${manualIncidentType}`, time),
                                    ...prev,
                                  ]);
                                  if (onUpdateIncident) {
                                    onUpdateIncident(incident, { type: manualIncidentType });
                                  }
                                } else if (selectedSuggestionIndex !== null) {
                                  const selected = classification.top_classification_suggestions[selectedSuggestionIndex];
                                  setPoliceNotes((prev) => [
                                    createPoliceNote(
                                      `Classification applied: ${selected.incident_type} (P${selected.priority})`,
                                      time
                                    ),
                                    ...prev,
                                  ]);
                                  if (onUpdateIncident) {
                                    onUpdateIncident(incident, {
                                      type: selected.incident_type,
                                      priority: selected.priority,
                                    });
                                  }
                                }
                                setManualIncidentType("");
                                setClassificationDismissed(true);
                              }}
                              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-ai/25 bg-ai/10 text-ai hover:bg-ai/15 transition-colors font-mono text-[10px] uppercase tracking-widest disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              <ThumbsUp className="w-3 h-3" />
                              Apply Selection
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* Incident Log */}
                  <div className="flex-1 min-h-0 flex flex-col space-y-1">
                    <div className="flex items-center justify-between px-0.5">
                      <p className="font-mono text-xs text-white/35 tracking-widest uppercase">Incident Log</p>
                      <div className="flex items-center gap-2">
                        <button
                          disabled={reportLoading}
                          onClick={handleGenerateReport}
                          className="flex items-center gap-1 px-2 py-0.5 rounded-md border border-dispatch/25 bg-dispatch/10 text-dispatch font-mono text-[10px] uppercase tracking-widest hover:bg-dispatch/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <FileText className="w-2.5 h-2.5" />
                          {reportLoading ? "Generating..." : "Generate Report"}
                        </button>
                        <button
                          disabled={classifying}
                          onClick={() => {
                            console.log("Analyse clicked");
                            if (DEBUG_ANALYSE_DUMMY_MODAL) {
                              const dummyResult: ClassificationResult = {
                                changed: true,
                                original_type: incident?.type ?? "",
                                suggested_type: "THEFT/LARCENY",
                                supporting_log: "Dummy: Officer observed missing valuables.",
                                recommendation: "Update incident category to THEFT/LARCENY.",
                                current_incident_type: incident?.type ?? "",
                                incident_type_change_required: true,
                                key_facts_detected: ["Dummy evidence row"],
                                reason: "Dummy mode enabled for UI trace.",
                                top_classification_suggestions: [
                                  {
                                    incident_type: "THEFT/LARCENY",
                                    priority: 2,
                                    occurrence_timing: "OCCURRED_EARLIER",
                                    confidence: 91,
                                    reason: "Dummy suggestion",
                                  },
                                ],
                              };
                              setClassification(dummyResult);
                              return;
                            }
                            fetchClassification();
                          }}
                          className="flex items-center gap-1 px-2 py-0.5 rounded-md border border-ai/25 bg-ai/10 text-ai font-mono text-[10px] uppercase tracking-widest hover:bg-ai/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <Sparkles className="w-2.5 h-2.5" />
                          {classifying ? "Analysing…" : "Analyse"}
                        </button>
                      </div>
                    </div>
                    {reportError ? (
                      <p className="text-[11px] text-emergency px-0.5">{reportError}</p>
                    ) : null}
                    {classifyError ? (
                      <p className="text-[11px] text-emergency px-0.5">{classifyError}</p>
                    ) : null}
                    <div
                      ref={logContainerRef}
                      className="flex-1 min-h-0 overflow-y-auto overscroll-contain scrollbar-thin rounded-xl border border-white/[0.08] bg-[#0F1117]"
                    >
                      <div className="min-h-full flex flex-col justify-start divide-y divide-white/[0.05]">
                        {incidentLogEntries.map((entry) => (
                          <DispatchEntry
                            key={entry.id}
                            time={entry.time}
                            type={entry.type}
                            text={entry.text}
                            critical={entry.critical}
                            police={entry.police}
                            caller={entry.caller}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* ASK AI Assistant */}
                  <div
                    className="shrink-0 rounded-xl border"
                    style={{ borderColor: "rgba(176,109,255,0.25)", backgroundColor: "rgba(176,109,255,0.04)" }}
                  >
                    <button
                      type="button"
                      onClick={() => setAskAiOpen((prev) => !prev)}
                      className="w-full px-3 py-2.5 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-1.5">
                        <Bot className="w-3.5 h-3.5 text-ai" />
                        <span className="font-mono text-xs font-bold text-ai tracking-[0.15em] uppercase">
                          Ask AI
                        </span>
                      </div>
                      {askAiOpen ? (
                        <ChevronDown className="w-3.5 h-3.5 text-white/45" />
                      ) : (
                        <ChevronUp className="w-3.5 h-3.5 text-white/45" />
                      )}
                    </button>

                    {askAiOpen && (
                      <div className="border-t border-white/[0.08] px-3 pb-3 pt-2 space-y-2">
                        <div
                          ref={aiChatContainerRef}
                          className="max-h-40 overflow-y-auto overscroll-contain scrollbar-thin rounded-lg border border-white/[0.08] bg-[#0F1117] p-2 space-y-2"
                        >
                          {aiChatMessages.length === 0 ? (
                            <p className="text-[11px] text-white/45 leading-relaxed">
                              Ask about this incident: safest route, backup recommendation, weapons risk, or summary.
                            </p>
                          ) : (
                            aiChatMessages.map((msg) => (
                              <div
                                key={msg.id}
                                className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                              >
                                {msg.role === "assistant" && (
                                  <div className="shrink-0 w-6 h-6 rounded-full border border-ai/30 bg-ai/10 flex items-center justify-center">
                                    <Bot className="w-3 h-3 text-ai" />
                                  </div>
                                )}
                                <div
                                  className={`max-w-[85%] rounded-lg px-2.5 py-2 text-[12px] leading-relaxed ${
                                    msg.role === "user"
                                      ? "bg-dispatch/10 border border-dispatch/25 text-dispatch"
                                      : "bg-white/[0.03] border border-white/[0.08] text-white/80"
                                  }`}
                                >
                                  {msg.content}
                                </div>
                                {msg.role === "user" && (
                                  <div className="shrink-0 w-6 h-6 rounded-full border border-dispatch/30 bg-dispatch/10 flex items-center justify-center">
                                    <UserRound className="w-3 h-3 text-dispatch" />
                                  </div>
                                )}
                              </div>
                            ))
                          )}
                          {aiChatLoading && (
                            <div className="flex items-center gap-2">
                              <div className="shrink-0 w-6 h-6 rounded-full border border-ai/30 bg-ai/10 flex items-center justify-center">
                                <Bot className="w-3 h-3 text-ai" />
                              </div>
                              <p className="text-[11px] text-white/45 animate-pulse">AI assistant is typing…</p>
                            </div>
                          )}
                        </div>
                        {aiChatError ? (
                          <p className="text-[11px] text-emergency">{aiChatError}</p>
                        ) : null}
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            handleAskDispatchAssistant();
                          }}
                          className="flex items-center gap-2"
                        >
                          <input
                            value={aiChatInput}
                            onChange={(e) => setAiChatInput(e.target.value)}
                            className="flex-1 rounded-lg border border-white/[0.10] bg-[#0F1117] px-2.5 py-2 text-xs text-white/85 placeholder:text-white/35 focus:outline-none focus:border-ai/35"
                            placeholder="Ask about this incident..."
                          />
                          <button
                            type="submit"
                            disabled={aiChatLoading || !aiChatInput.trim()}
                            className="shrink-0 inline-flex items-center gap-1 rounded-lg px-2.5 py-2 border border-ai/25 bg-ai/10 text-ai font-mono text-[10px] uppercase tracking-widest hover:bg-ai/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <Send className="w-3 h-3" />
                            Ask
                          </button>
                        </form>
                      </div>
                    )}
                  </div>

                  {/* Operational Summary */}
                  {(summarizing || summary) && (
                    <div
                      className="rounded-xl border p-3 space-y-1.5"
                      style={{ borderColor: "rgba(0,184,255,0.25)", backgroundColor: "rgba(0,184,255,0.05)" }}
                    >
                      <div className="flex items-center gap-1.5 text-dispatch font-bold text-xs tracking-[0.15em] uppercase">
                        <CheckCircle className="w-3.5 h-3.5" />
                        OPERATIONAL SUMMARY
                      </div>
                      {summarizing ? (
                        <p className="text-sm text-white/30 animate-pulse">Generating AI summary…</p>
                      ) : (
                        <p className="text-sm text-white/70 leading-relaxed">{summary}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>

          {/* ── Sticky bottom bar — single row ──────────────── */}
          <div className="shrink-0 bg-[#03050D]/95 backdrop-blur-md border-t border-white/[0.08] px-3 py-2.5 flex items-center gap-1.5">

            {/* Outcome buttons */}
            {OUTCOMES.map((outcome) => {
              const Icon = outcome.icon;
              const isSelected = confirmedOutcome === outcome.full;
              const isDisabled = completed || (!!confirmedOutcome && !isSelected);
              return (
                <button
                  key={outcome.full}
                  disabled={isDisabled}
                  onClick={() => setPendingOutcome(outcome)}
                  title={outcome.full}
                  className="flex-1 flex flex-col items-center gap-0.5 py-2 rounded-lg border font-mono text-[9px] uppercase tracking-wide transition-all active:scale-95 hover:brightness-125 disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    backgroundColor: isSelected ? outcome.bg : `${outcome.color}12`,
                    borderColor: isSelected ? outcome.border : `${outcome.color}40`,
                    color: outcome.color,
                  }}
                >
                  <Icon className="w-3.5 h-3.5" style={{ color: outcome.color }} />
                  {outcome.label}
                </button>
              );
            })}

            {/* Mark Completed */}
            {completed ? (
              <button
                disabled
                className="flex-1 rounded-lg py-2 flex flex-col items-center justify-center gap-0.5 font-mono text-[9px] tracking-wide uppercase border border-field/40 bg-field/12 text-field disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <CheckCircle className="w-3.5 h-3.5 text-field" />
                RESOLVED
              </button>
            ) : (
              <button
                onClick={() => accepted && setShowConfirm(true)}
                title={!accepted ? "Accept the task first" : "Mark as completed"}
                className="flex-1 rounded-lg py-2 flex flex-col items-center justify-center gap-0.5 font-mono text-[9px] tracking-wide uppercase border border-dispatch/40 bg-dispatch/12 text-dispatch transition-all active:scale-95 hover:brightness-125"
              >
                <CheckCircle className="w-3.5 h-3.5" />
                COMPLETED
              </button>
            )}

            {/* Voice FAB */}
            <button
              onClick={handleRecordVoice}
              disabled={isRecording}
              className="shrink-0 w-11 h-11 rounded-full flex items-center justify-center transition-all active:scale-90 bg-[#1a0f1f]"
              style={{
                backgroundColor: isRecording ? "#FF3D5A" : undefined,
                border: isRecording ? "2px solid #FF3D5A" : "2px solid rgba(176,109,255,0.5)",
                boxShadow: isRecording ? "0 0 24px rgba(255,61,90,0.6)" : "0 0 14px rgba(176,109,255,0.25)",
              }}
              title={isRecording ? "Listening…" : "Record voice update"}
            >
              <Mic className={`w-4.5 h-4.5 ${isRecording ? "text-white animate-pulse" : "text-ai"}`} />
            </button>
          </div>
        </>
      ) : (
        /* ── Empty state ── */
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="relative">
            <div className="w-16 h-16 rounded-full border border-white/10 flex items-center justify-center">
              <MapPin className="w-7 h-7 text-white/15" />
            </div>
            <div className="absolute -top-1 -right-1 h-3 w-3 rounded-full border border-dispatch/40 animate-pulse bg-dispatch/20" />
          </div>
          <div className="text-center space-y-1">
            <p className="text-sm font-semibold text-white/30">No incident selected</p>
            <p className="font-mono text-xs text-white/20">Select an incident from the queue</p>
          </div>
        </div>
      )}
    </main>
  );
}

function LocationHistoryEntry({ label, detail, color }: { label: string; detail: string; color: string }) {
  return (
    <div className="flex gap-2 items-start">
      <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: color }} />
      <div>
        <span className="font-mono text-[11px] font-bold uppercase tracking-wide" style={{ color }}>{label}</span>
        <p className="text-xs text-white/50 leading-snug mt-0.5">{detail}</p>
      </div>
    </div>
  );
}

function DispatchEntry({
  time,
  type,
  text,
  critical,
  police,
  caller,
}: {
  time: string;
  type: string;
  text: string;
  critical?: boolean;
  police?: boolean;
  caller?: boolean;
}) {
  const typeColor = critical ? "#FF3D5A" : police ? "#00E87A" : caller ? "#FFAA00" : "#00B8FF";
  return (
    <div className={`px-3 py-3 space-y-1 ${caller ? "bg-[#FFAA00]/[0.03]" : ""}`}>
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs text-white/40">{time}</span>
        <span className="font-mono text-xs font-bold" style={{ color: typeColor }}>
          — {type}
        </span>
      </div>
      <p className={`text-sm leading-relaxed ${
        critical ? "text-emergency font-semibold uppercase tracking-wide"
        : police ? "text-white/85"
        : caller ? "text-white/75"
        : "text-white/60"
      }`}>
        {caller && <span className="inline-block w-1.5 h-1.5 rounded-full bg-civic mr-2 mb-0.5" />}
        {text}
      </p>
    </div>
  );
}
