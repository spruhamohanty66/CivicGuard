"use client";

import { useEffect } from "react";
import { Info, X } from "lucide-react";

export function ContactsModal({
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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1800] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0F1117] shadow-2xl overflow-hidden">
        <div className="px-4 py-3.5 border-b border-white/[0.08] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-dispatch" />
            <h3 className="text-xs font-bold tracking-[0.2em] uppercase text-white/70">
              Montgomery Contacts
            </h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-md border border-white/10 hover:bg-white/[0.04] transition-colors flex items-center justify-center"
            title="Close"
          >
            <X className="w-4 h-4 text-white/40" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div className="rounded-md border border-white/10 bg-white/[0.02] px-3 py-2.5 text-[13px] text-white/75 leading-relaxed">
            <p className="font-semibold text-white/90">Police Department</p>
            <p>320 North Ripley Street</p>
            <p>Montgomery, AL 36104</p>
            <p className="font-mono mt-1">334-625-2532</p>
          </div>

          <div className="rounded-md border border-white/10 bg-white/[0.02] px-3 py-2.5 text-[13px] text-white/75 leading-relaxed">
            <p className="font-semibold text-white/90">Chief of Police</p>
            <p>James N. Graboys</p>
            <p className="font-mono">jgraboys@montgomeryal.gov</p>
            <p className="font-mono">334-625-2807</p>
          </div>
        </div>
      </div>
    </div>
  );
}

