"use client";

import { useEffect } from "react";
import { PublicEventsCalendar } from "@/components/PublicEventsCalendar";
import { CalendarDays, X } from "lucide-react";

export function EventsDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (!open) return;
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  return (
    <>
      {/* Backdrop */}
      {open && (
        <button
          aria-label="Close events"
          onClick={onClose}
          className="fixed inset-0 z-[1900] bg-black/60 backdrop-blur-[2px]"
        />
      )}

      {/* Drawer */}
      <aside
        className="fixed top-0 right-0 z-[2000] h-screen w-[380px] max-w-[92vw] border-l border-white/[0.08] bg-[#0F1117] shadow-2xl transition-transform duration-200"
        style={{ transform: open ? "translateX(0)" : "translateX(100%)" }}
        aria-hidden={!open}
      >
        <div className="h-full flex flex-col">
          <div className="px-4 py-3.5 border-b border-white/[0.08] flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-3.5 h-3.5 text-civic" />
              <h2 className="text-xs font-bold tracking-[0.2em] uppercase text-white/60">
                Public Events
              </h2>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-md border border-white/10 hover:bg-white/[0.04] transition-colors flex items-center justify-center"
              title="Close"
            >
              <X className="w-4 h-4 text-white/40" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-thin p-4">
            <PublicEventsCalendar />
          </div>
        </div>
      </aside>
    </>
  );
}

