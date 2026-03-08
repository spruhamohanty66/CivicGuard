"use client";

import { useState, useEffect, useCallback } from "react";
import type { Incident } from "@/lib/types";

const POLL_INTERVAL_MS = 120_000; // 2 minutes

export function useIncidents() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchIncidents = useCallback(async () => {
    try {
      const res = await fetch("/api/incidents", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: Incident[] = await res.json();
      setIncidents(data);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchIncidents();
    const timer = setInterval(fetchIncidents, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [fetchIncidents]);

  return { incidents, loading, error, lastUpdated, refetch: fetchIncidents };
}
