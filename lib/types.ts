export type IncidentSource = "911" | "311" | "field";

export interface Incident {
  id: string;
  incidentId: string;
  type: string;
  address: string;
  startTime: string; // ISO string — used for sorting
  createdAt?: string; // ISO string — displayed on card
  source: IncidentSource;
  district?: string;
  priority?: number;
  status?: string;
  description?: string;
  aiScore?: number;
  aiCategory?: string;
  geo?: { lat: number; lng: number };
  callNotes?: string[]; // pre-populated log entries from simulated call transcript
}

export type FilterTab = "incoming" | "field" | "completed";
