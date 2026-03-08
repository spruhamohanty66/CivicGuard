"use client";

import { useState, useRef } from "react";
import {
  Phone,
  X,
  Mic,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  MapPin,
  FileText,
  Building2,
  PhoneCall,
  LocateFixed,
} from "lucide-react";
import type { Incident } from "@/lib/types";
import { calculateAIScore } from "@/lib/aiScore";

type CallState =
  | "idle"
  | "speaking-intro"
  | "listening"
  | "processing"
  | "speaking-location"
  | "listening-location"
  | "result";

interface CallResult {
  callType: "911" | "311";
  incidentType: string;
  priority: number;
  address: string;
  description: string;
  summary: string;
  department?: string | null;
  highlights: string[];
  callBullets: string[];
}

interface SimulateCallProps {
  open: boolean;
  onClose: () => void;
  onAddIncoming: (incident: Incident) => void;
}

function speak(text: string, onEnd?: () => void) {
  if (typeof window === "undefined") return;
  speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = 0.92;
  utter.pitch = 1.05;
  if (onEnd) utter.onend = onEnd;
  speechSynthesis.speak(utter);
}

function priorityColor(p: number) {
  if (p === 0) return "#FF3D5A";
  if (p === 1) return "#FF6B35";
  if (p === 2) return "#FFAA00";
  return "#00E87A";
}

function isUnknownAddress(addr: string) {
  const lower = addr.toLowerCase().trim();
  return !addr || lower === "unknown" || lower === "unknown location" || lower === "n/a";
}

function getGPS(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 6000 }
    );
  });
}

function listenOnce(
  onResult: (text: string) => void,
  onError: () => void
) {
  const SpeechRecognition =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SpeechRecognition) { onError(); return; }
  const rec = new SpeechRecognition();
  rec.lang = "en-US";
  rec.interimResults = true;
  rec.maxAlternatives = 1;
  let captured = "";
  rec.onresult = (event: any) => {
    let text = "";
    for (let i = 0; i < event.results.length; i++) {
      text += event.results[i][0].transcript + " ";
    }
    captured = text.trim();
  };
  rec.onend = () => onResult(captured);
  rec.onerror = onError;
  rec.start();
  return rec;
}

export function SimulateCall({ open, onClose, onAddIncoming }: SimulateCallProps) {
  const [callState, setCallState] = useState<CallState>("idle");
  const [transcript, setTranscript] = useState("");
  const [locationTranscript, setLocationTranscript] = useState("");
  const [result, setResult] = useState<CallResult | null>(null);
  const [agentMessage, setAgentMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [gpsAddress, setGpsAddress] = useState<string | null>(null);
  const [callbackCaseNumber, setCallbackCaseNumber] = useState<string | null>(null);
  const [callbackStatus, setCallbackStatus] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const transcriptRef = useRef("");
  const geoRef = useRef<{ lat: number; lng: number } | null>(null);
  const CALLBACK_PHONE = "+13015550192";

  function closeModal() {
    speechSynthesis.cancel();
    setCallState("idle");
    setTranscript("");
    setLocationTranscript("");
    setResult(null);
    setError(null);
    setAgentMessage("");
    setGpsAddress(null);
    setCallbackCaseNumber(null);
    setCallbackStatus("idle");
    transcriptRef.current = "";
    geoRef.current = null;
    onClose();
  }

  function startCall() {
    setTranscript("");
    setLocationTranscript("");
    transcriptRef.current = "";
    geoRef.current = null;
    setResult(null);
    setError(null);
    setGpsAddress(null);
    setCallbackCaseNumber(null);
    setCallbackStatus("idle");
    setCallState("speaking-intro");
    const intro = "Please describe the situation and location so the system can assist you.";
    setAgentMessage(intro);
    speak(intro, () => startListening());
  }

  function startListening() {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError("Voice not supported. Please use Chrome.");
      setCallState("idle");
      return;
    }

    setCallState("listening");
    setAgentMessage("");

    // Start GPS in parallel
    getGPS().then((geo) => { geoRef.current = geo; });

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.start();

    recognition.onresult = (event: any) => {
      let text = "";
      for (let i = 0; i < event.results.length; i++) {
        text += event.results[i][0].transcript + " ";
      }
      transcriptRef.current = text.trim();
      setTranscript(text.trim());
    };

    recognition.onend = () => processTranscript(transcriptRef.current);
    recognition.onerror = () => {
      setError("Voice capture failed. Please try again.");
      setCallState("idle");
    };
  }

  async function processTranscript(mainTranscript: string, locationText?: string) {
    if (!mainTranscript) { setCallState("idle"); return; }
    setCallState("processing");

    const combined = locationText
      ? `${mainTranscript}. Location: ${locationText}`
      : mainTranscript;

    try {
      const res = await fetch("/api/simulate-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: combined }),
      });
      const data: CallResult = await res.json();

      // Resolve address: GPS > extracted > ask user
      if (isUnknownAddress(data.address)) {
        const geo = geoRef.current;
        if (geo) {
          // Use GPS coordinates
          const addr = `${geo.lat.toFixed(5)}, ${geo.lng.toFixed(5)} (GPS)`;
          data.address = addr;
          setGpsAddress(addr);
          showResult(data);
        } else if (!locationText) {
          // No GPS, no location in transcript → ask user
          askForLocation(mainTranscript);
          return;
        } else {
          // Had location follow-up but still unknown
          data.address = locationText;
          showResult(data);
        }
      } else {
        showResult(data);
      }
    } catch {
      setError("Failed to process call. Please try again.");
      setCallState("idle");
    }
  }

  function askForLocation(mainTranscript: string) {
    setCallState("speaking-location");
    const prompt = "Could you please provide the location of the incident?";
    setAgentMessage(prompt);
    speak(prompt, () => {
      setCallState("listening-location");
      setAgentMessage("");
      listenOnce(
        (locText) => {
          setLocationTranscript(locText);
          processTranscript(mainTranscript, locText);
        },
        () => {
          setError("Could not capture location. Please try again.");
          setCallState("idle");
        }
      );
    });
  }

  function showResult(data: CallResult) {
    setResult(data);
    setCallState("result");
    const { score } = calculateAIScore(data.incidentType);
    if (score < 65) {
      triggerCallerCallback();
    }
    const closing =
      data.callType === "311" && data.department
        ? `Thank you for the details. We are forwarding the incident to ${data.department}.`
        : "Thank you for the details. We will do the needful action.";
    speak(closing);
  }

  function buildCaseNumber() {
    const year = new Date().getFullYear();
    const serial = String(Math.floor(10000 + Math.random() * 90000));
    return `CG-${year}-${serial}`;
  }

  async function triggerCallerCallback() {
    try {
      const caseNumber = buildCaseNumber();
      setCallbackCaseNumber(caseNumber);
      setCallbackStatus("sending");
      const res = await fetch("/api/caller-callback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: CALLBACK_PHONE,
          caseNumber,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setCallbackStatus("sent");
    } catch {
      setCallbackStatus("failed");
    }
  }

  function handleAddToQueue() {
    if (!result) return;
    const now = new Date().toISOString();
    const id = `sim-${Date.now()}`;
    const { score, category } = calculateAIScore(result.incidentType);
    const incident: Incident = {
      id,
      incidentId: id,
      type: result.incidentType,
      address: result.address,
      startTime: now,
      createdAt: now,
      source: "911",
      priority: result.priority,
      description: result.description,
      aiScore: score,
      aiCategory: category,
      geo: geoRef.current ?? undefined,
      callNotes: result.callBullets ?? [],
    };
    onAddIncoming(incident);
    closeModal();
  }

  const isAgentSpeaking = callState === "speaking-intro" || callState === "speaking-location";
  const isListening = callState === "listening" || callState === "listening-location";
  const isProcessing = callState === "processing";
  const resultScore = result ? calculateAIScore(result.incidentType).score : null;
  const isDispatchable = !!result && result.callType === "911" && (resultScore ?? 0) >= 65;
  const fullTranscript = locationTranscript
    ? `${transcript} [Location: ${locationTranscript}]`
    : transcript;

  return (
    <>
      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div
            className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0F1117] flex flex-col overflow-hidden"
            style={{ maxHeight: "90vh" }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08]">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: "rgba(255,61,90,0.15)", border: "1px solid rgba(255,61,90,0.3)" }}
                >
                  <Phone className="w-4 h-4 text-emergency" />
                </div>
                <div>
                  <p className="font-bold text-white text-sm tracking-wide">Simulate Call</p>
                  <p className="font-mono text-[10px] text-white/35 uppercase tracking-widest">
                    AI-Assisted Call Intake
                  </p>
                </div>
              </div>
              <button onClick={closeModal} className="text-white/25 hover:text-white/60 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">

              {/* Idle */}
              {callState === "idle" && !result && (
                <div className="flex flex-col items-center gap-5 py-6">
                  <div
                    className="w-16 h-16 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: "rgba(255,61,90,0.1)", border: "1px solid rgba(255,61,90,0.25)" }}
                  >
                    <PhoneCall className="w-7 h-7 text-emergency" />
                  </div>
                  <div className="text-center space-y-1.5">
                    <p className="font-bold text-white text-sm">Ready to simulate a call</p>
                    <p className="text-xs text-white/40 leading-relaxed max-w-xs">
                      Click Start Call. The AI agent will prompt you to describe the situation, then classify and route the call automatically.
                    </p>
                  </div>
                  {error && <p className="text-xs text-emergency text-center">{error}</p>}
                  <button
                    onClick={startCall}
                    className="px-8 py-3 rounded-xl font-bold text-sm uppercase tracking-widest text-white transition-all active:scale-95 hover:opacity-90"
                    style={{ backgroundColor: "#FF3D5A", boxShadow: "0 0 20px rgba(255,61,90,0.3)" }}
                  >
                    Start Call
                  </button>
                </div>
              )}

              {/* Agent speaking (intro or location prompt) */}
              {isAgentSpeaking && (
                <div className="flex flex-col items-center gap-4 py-6">
                  <div
                    className="w-14 h-14 rounded-full border-2 border-dispatch/50 flex items-center justify-center animate-pulse"
                    style={{ backgroundColor: "rgba(0,184,255,0.08)" }}
                  >
                    <Phone className="w-6 h-6 text-dispatch" />
                  </div>
                  <div className="text-center space-y-1">
                    <p className="font-mono text-[10px] text-dispatch/60 uppercase tracking-widest">AI Agent Speaking</p>
                    <p className="text-sm text-white/80 italic leading-relaxed px-4">"{agentMessage}"</p>
                  </div>
                  {callState === "speaking-location" && transcript && (
                    <div
                      className="w-full rounded-xl border p-3"
                      style={{ borderColor: "rgba(255,255,255,0.06)", backgroundColor: "rgba(255,255,255,0.02)" }}
                    >
                      <p className="font-mono text-[10px] text-white/25 uppercase tracking-widest mb-1">Description captured</p>
                      <p className="text-xs text-white/45 leading-relaxed italic">"{transcript}"</p>
                    </div>
                  )}
                </div>
              )}

              {/* Listening */}
              {isListening && (
                <div className="space-y-4">
                  <div className="flex flex-col items-center gap-3 py-4">
                    <div className="relative w-14 h-14">
                      <span className="absolute inset-0 rounded-full animate-ping bg-emergency opacity-25" />
                      <div
                        className="relative w-14 h-14 rounded-full border-2 border-emergency flex items-center justify-center"
                        style={{ backgroundColor: "rgba(255,61,90,0.1)" }}
                      >
                        <Mic className="w-6 h-6 text-emergency animate-pulse" />
                      </div>
                    </div>
                    <p className="font-mono text-[10px] text-emergency uppercase tracking-widest">
                      {callState === "listening-location" ? "Listening for location…" : "Listening…"}
                    </p>
                  </div>

                  {/* Show prior description when listening for location */}
                  {callState === "listening-location" && transcript && (
                    <div
                      className="rounded-xl border p-3"
                      style={{ borderColor: "rgba(255,255,255,0.06)", backgroundColor: "rgba(255,255,255,0.02)" }}
                    >
                      <p className="font-mono text-[10px] text-white/25 uppercase tracking-widest mb-1">Description captured</p>
                      <p className="text-xs text-white/45 leading-relaxed italic">"{transcript}"</p>
                    </div>
                  )}

                  {transcript && callState === "listening" && (
                    <div
                      className="rounded-xl border p-3 min-h-[80px]"
                      style={{ borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(255,255,255,0.03)" }}
                    >
                      <p className="font-mono text-[10px] text-white/30 uppercase tracking-widest mb-1.5">Transcript</p>
                      <p className="text-sm text-white/75 leading-relaxed">{transcript}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Processing */}
              {isProcessing && (
                <div className="flex flex-col items-center gap-4 py-8">
                  <Loader2 className="w-10 h-10 text-ai animate-spin" />
                  <div className="text-center space-y-1">
                    <p className="font-mono text-[10px] text-ai/60 uppercase tracking-widest">AI Analysing Call</p>
                    <p className="text-xs text-white/35">Classifying incident type and routing…</p>
                  </div>
                  {fullTranscript && (
                    <div
                      className="w-full rounded-xl border p-3"
                      style={{ borderColor: "rgba(255,255,255,0.06)", backgroundColor: "rgba(255,255,255,0.02)" }}
                    >
                      <p className="font-mono text-[10px] text-white/25 uppercase tracking-widest mb-1">Transcript</p>
                      <p className="text-xs text-white/45 leading-relaxed">{fullTranscript}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Result */}
              {callState === "result" && result && (
                <div className="space-y-3">
                  {/* Call type banner */}
                  <div
                    className="rounded-xl px-4 py-3 flex items-center gap-3"
                    style={{
                      backgroundColor: result.callType === "911" ? "rgba(255,61,90,0.1)" : "rgba(255,170,0,0.1)",
                      border: `1px solid ${result.callType === "911" ? "rgba(255,61,90,0.3)" : "rgba(255,170,0,0.3)"}`,
                    }}
                  >
                    {result.callType === "911" ? (
                      <AlertTriangle className="w-5 h-5 text-emergency shrink-0" />
                    ) : (
                      <CheckCircle2 className="w-5 h-5 text-civic shrink-0" />
                    )}
                    <div>
                      <p
                        className="font-bold text-sm uppercase tracking-widest"
                        style={{ color: result.callType === "911" ? "#FF3D5A" : "#FFAA00" }}
                      >
                        {result.callType === "911" ? "911 Emergency Call" : "311 Civic Call"}
                      </p>
                      <p className="text-xs text-white/45">
                        {result.callType === "911"
                          ? "Incident will be added to the Live Queue"
                          : `Forwarding to: ${result.department ?? "Civic Services"}`}
                      </p>
                    </div>
                  </div>

                  {/* Incident details */}
                  <div
                    className="rounded-xl border p-4 space-y-3"
                    style={{ borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(255,255,255,0.02)" }}
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <p className="font-bold text-white text-sm uppercase tracking-wide">{result.incidentType}</p>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span
                          className="font-mono text-xs font-bold px-2.5 py-0.5 rounded-sm"
                          style={{ backgroundColor: priorityColor(result.priority), color: "#03050D" }}
                        >
                          P{result.priority}
                        </span>
                        {(() => {
                          const { score } = calculateAIScore(result.incidentType);
                          const bg = score >= 80 ? "#FF3D5A" : score >= 50 ? "#FFAA00" : "#00E87A";
                          return (
                            <span
                              className="font-mono text-xs font-bold px-2.5 py-0.5 rounded-sm"
                              style={{ backgroundColor: bg, color: "#03050D" }}
                            >
                              AI {score}
                            </span>
                          );
                        })()}
                      </div>
                    </div>
                    {resultScore !== null && resultScore < 65 && (
                      <div
                        className="rounded-lg border px-3 py-2 space-y-1"
                        style={{ borderColor: "rgba(255,170,0,0.25)", backgroundColor: "rgba(255,170,0,0.08)" }}
                      >
                        <p className="font-mono text-[10px] text-civic uppercase tracking-widest">
                          Not dispatched (AI score below 65)
                        </p>
                        <p className="text-xs text-white/65">
                          Automatic caller callback SMS initiated.
                        </p>
                        <p className="font-mono text-[11px] text-white/70">
                          Case #{callbackCaseNumber ?? "Generating..."}
                        </p>
                        <p className="font-mono text-[10px] text-white/45">
                          {callbackStatus === "sending" && "SMS status: sending..."}
                          {callbackStatus === "sent" && "SMS status: sent"}
                          {callbackStatus === "failed" && "SMS status: failed (retry in backend)"}
                        </p>
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      {gpsAddress ? (
                        <LocateFixed className="w-3.5 h-3.5 text-field shrink-0" />
                      ) : (
                        <MapPin className="w-3.5 h-3.5 text-emergency shrink-0" />
                      )}
                      <span className="text-sm text-white/70 font-medium">{result.address}</span>
                      {gpsAddress && (
                        <span className="font-mono text-[9px] text-field/60 border border-field/20 px-1.5 py-0.5 rounded-sm">
                          GPS
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-white/55 leading-relaxed">{result.description}</p>

                    {result.highlights?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {result.highlights.map((h, i) => (
                          <span
                            key={i}
                            className="font-mono text-[10px] text-white/40 px-2 py-0.5 rounded-sm border border-white/[0.08]"
                          >
                            {h}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Call log bullets */}
                  {result.callBullets?.length > 0 && (
                    <div
                      className="rounded-xl border p-3 space-y-2"
                      style={{ borderColor: "rgba(176,109,255,0.2)", backgroundColor: "rgba(176,109,255,0.04)" }}
                    >
                      <div className="flex items-center gap-1.5">
                        <FileText className="w-3 h-3 text-ai" />
                        <p className="font-mono text-[10px] text-ai uppercase tracking-widest">Call Log Notes</p>
                      </div>
                      <ul className="space-y-1.5">
                        {result.callBullets.map((bullet, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="w-1 h-1 rounded-full bg-ai/60 mt-1.5 shrink-0" />
                            <span className="text-xs text-white/65 leading-relaxed">{bullet}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Summary */}
                  <div
                    className="rounded-xl border p-3 space-y-1.5"
                    style={{ borderColor: "rgba(0,184,255,0.2)", backgroundColor: "rgba(0,184,255,0.04)" }}
                  >
                    <div className="flex items-center gap-1.5">
                      <FileText className="w-3 h-3 text-dispatch" />
                      <p className="font-mono text-[10px] text-dispatch uppercase tracking-widest">AI Summary</p>
                    </div>
                    <p className="text-xs text-white/65 leading-relaxed">{result.summary}</p>
                  </div>

                  {/* 311 department */}
                  {result.callType === "311" && result.department && (
                    <div
                      className="rounded-xl border p-3 flex items-center gap-3"
                      style={{ borderColor: "rgba(255,170,0,0.2)", backgroundColor: "rgba(255,170,0,0.05)" }}
                    >
                      <Building2 className="w-4 h-4 text-civic shrink-0" />
                      <div>
                        <p className="font-mono text-[10px] text-civic uppercase tracking-widest">Routing To</p>
                        <p className="text-sm font-bold text-white/80">{result.department}</p>
                      </div>
                    </div>
                  )}

                  {/* Transcript */}
                  <div
                    className="rounded-xl border p-3"
                    style={{ borderColor: "rgba(255,255,255,0.06)", backgroundColor: "rgba(255,255,255,0.02)" }}
                  >
                    <p className="font-mono text-[10px] text-white/25 uppercase tracking-widest mb-1.5">Call Transcript</p>
                    <p className="text-xs text-white/50 leading-relaxed italic">"{fullTranscript}"</p>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            {callState === "result" && result && (
              <div className="px-5 py-4 border-t border-white/[0.08] flex gap-3">
                <button
                  onClick={() => { setCallState("idle"); setResult(null); setTranscript(""); setLocationTranscript(""); setGpsAddress(null); }}
                  className="flex-1 py-2.5 rounded-xl border border-white/10 text-white/40 font-mono text-xs uppercase tracking-widest hover:bg-white/[0.04] transition-colors"
                >
                  New Call
                </button>
                {isDispatchable ? (
                  <button
                    onClick={handleAddToQueue}
                    className="flex-1 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest text-white hover:opacity-90 transition-opacity active:scale-95"
                    style={{ backgroundColor: "#FF3D5A", boxShadow: "0 0 16px rgba(255,61,90,0.3)" }}
                  >
                    Add to Queue
                  </button>
                ) : (
                  <button
                    onClick={closeModal}
                    className="flex-1 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest text-[#03050D] hover:opacity-90 transition-opacity active:scale-95"
                    style={{ backgroundColor: result.callType === "311" ? "#FFAA00" : "#00B8FF" }}
                  >
                    {result.callType === "311" ? "Forward Ticket" : "Close"}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
