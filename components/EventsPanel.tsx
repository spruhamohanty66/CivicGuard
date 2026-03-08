"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { PublicEventsCalendar } from "@/components/PublicEventsCalendar";
import { Shield } from "lucide-react";

export function EventsPanel() {
  return (
    <aside className="flex flex-col bg-[#0F1117] border-l border-white/[0.08] w-80 shrink-0 h-screen overflow-hidden">
      <div className="px-4 py-3.5 border-b border-white/[0.08] shrink-0">
        <div className="flex items-center gap-2">
          <Shield className="w-3.5 h-3.5 text-dispatch" />
          <h2 className="text-xs font-bold tracking-[0.2em] uppercase text-white/60">
            Ops Readiness
          </h2>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          <PublicEventsCalendar />
        </div>
      </ScrollArea>
    </aside>
  );
}

