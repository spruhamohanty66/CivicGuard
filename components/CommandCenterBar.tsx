"use client";

import { useEffect, useState } from "react";
import { Activity, CalendarDays, ChevronRight, Cpu, Info, Moon, PhoneCall, Sun } from "lucide-react";

const CITY_TZ = "Etc/GMT+6";

export function CommandCenterBar({
  onOpenCalendar,
  onOpenContacts,
  onSimulateCall,
  theme,
  onToggleTheme,
}: {
  onOpenCalendar?: () => void;
  onOpenContacts?: () => void;
  onSimulateCall?: () => void;
  theme: "dark" | "light";
  onToggleTheme?: () => void;
}) {
  const [clock, setClock] = useState("");

  useEffect(() => {
    const tick = () =>
      setClock(
        new Date().toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
          timeZone: CITY_TZ,
        }),
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.10] bg-[#0F1117]/75 backdrop-blur-md shrink-0 shadow-[0_10px_24px_rgba(0,0,0,0.35)]">
      <div className="flex items-center gap-2 min-w-0">
        <Activity className="w-3 h-3 text-field shrink-0" />
        <span className="text-[10px] font-semibold tracking-widest uppercase text-white/55 shrink-0">
          Command Center
        </span>
        <ChevronRight className="w-3 h-3 text-white/20 shrink-0" />
        <span className="font-mono text-[10px] text-white/35 truncate">Montgomery City PD</span>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <div className="flex items-center gap-1">
          <Cpu className="w-3 h-3 text-ai" />
          <span className="font-mono text-[9px] text-ai/65">AI ONLINE</span>
        </div>
        <button
          onClick={onOpenCalendar}
          className="flex items-center justify-center w-7 h-7 rounded-md border border-civic/30 bg-civic/10 hover:bg-civic/20 transition-colors"
          title="Public Events Calendar"
        >
          <CalendarDays className="w-3.5 h-3.5 text-civic" />
        </button>
        <button
          onClick={onOpenContacts}
          className="flex items-center justify-center w-7 h-7 rounded-md border border-dispatch/30 bg-dispatch/10 hover:bg-dispatch/20 transition-colors"
          title="Montgomery Contacts"
        >
          <Info className="w-3.5 h-3.5 text-dispatch" />
        </button>
        <button
          onClick={onSimulateCall}
          className="flex items-center gap-1 px-2.5 h-7 rounded-md border border-emergency/30 bg-emergency/10 hover:bg-emergency/20 transition-colors active:scale-95"
          title="Simulate Call"
        >
          <PhoneCall className="w-3.5 h-3.5 text-emergency" />
          <span className="font-mono text-[9px] font-bold text-emergency tracking-widest uppercase">
            911 Simulate
          </span>
        </button>
        <button
          onClick={onToggleTheme}
          className="flex items-center gap-1 px-2.5 h-7 rounded-md border border-white/20 bg-white/5 hover:bg-white/10 transition-colors active:scale-95"
          title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
        >
          {theme === "dark" ? (
            <Sun className="w-3.5 h-3.5 text-civic" />
          ) : (
            <Moon className="w-3.5 h-3.5 text-dispatch" />
          )}
          <span className="font-mono text-[9px] font-bold text-white/75 tracking-widest uppercase">
            {theme === "dark" ? "Light" : "Dark"}
          </span>
        </button>
        <div className="font-mono text-xs font-bold text-white/70 tracking-widest">{clock}</div>
      </div>
    </div>
  );
}

