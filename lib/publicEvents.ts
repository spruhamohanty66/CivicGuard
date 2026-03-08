export type PublicEventCategory =
  | "Festival"
  | "Political Rally"
  | "Parade"
  | "Concert"
  | "Sports"
  | "Community"
  | "Protest"
  | "Other";

export type EventRiskLevel = 1 | 2 | 3 | 4 | 5;

export interface PublicEventSource {
  name: string;
  url?: string;
}

export interface PublicEvent {
  id: string;
  title: string;
  category: PublicEventCategory;
  startTime: string; // ISO
  endTime?: string; // ISO
  locationName: string;
  address?: string;
  geo?: { lat: number; lng: number };
  expectedAttendance?: number;
  riskLevel: EventRiskLevel;
  notes?: string;
  source?: PublicEventSource;
  recommendedPosture?: string[];
}

const LOCATION_GEO: Record<string, { lat: number; lng: number }> = {
  "Civic Square": { lat: 39.084, lng: -77.151 },
  "Downtown Plaza": { lat: 39.0903, lng: -77.1526 },
  "Riverfront Park": { lat: 39.1015, lng: -77.1607 },
  "Memorial Stadium": { lat: 39.0789, lng: -77.1462 },
  "Central Library": { lat: 39.0917, lng: -77.1469 },
  "Convention Center": { lat: 39.0966, lng: -77.1538 },
  "Main St Corridor": { lat: 39.0885, lng: -77.1583 },
  "Oakwood Loop": { lat: 39.082, lng: -77.165 },
  "Transit Hub": { lat: 39.0831, lng: -77.1481 },
};

function jitterGeo(seed: number, base?: { lat: number; lng: number }) {
  if (!base) return undefined;
  const rng = mulberry32(seed);
  const jLat = (rng() - 0.5) * 0.01; // ~1.1km
  const jLng = (rng() - 0.5) * 0.01;
  return { lat: base.lat + jLat, lng: base.lng + jLng };
}

function ymd(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function isoLocal(date: Date) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    0,
    0,
  ).toISOString();
}

function atTime(base: Date, hours: number, minutes = 0) {
  const d = new Date(base);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

function hashStringToUint32(str: string) {
  // Simple, deterministic hash (not cryptographic).
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  return function rand() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, arr: T[]) {
  return arr[Math.floor(rng() * arr.length)];
}

function clampRisk(n: number): EventRiskLevel {
  if (n <= 1) return 1;
  if (n === 2) return 2;
  if (n === 3) return 3;
  if (n === 4) return 4;
  return 5;
}

export function getMockPublicEventsForRange(params: {
  start: Date;
  end: Date;
  cityName?: string;
}): PublicEvent[] {
  const { start, end, cityName = "City" } = params;
  const startDay = new Date(start);
  startDay.setHours(0, 0, 0, 0);
  const endDay = new Date(end);
  endDay.setHours(0, 0, 0, 0);

  const titles = [
    "Farmers Market",
    "Food Truck Night",
    "Downtown Art Walk",
    "Community Festival",
    "High School Football Game",
    "Charity 5K Run",
    "Street Fair",
    "Union Demonstration",
    "Political Rally",
    "Cultural Parade",
    "Outdoor Concert",
    "City Council Meeting (Public)",
  ];
  const locations = [
    "Civic Square",
    "Downtown Plaza",
    "Riverfront Park",
    "Memorial Stadium",
    "Central Library",
    "Convention Center",
    "Main St Corridor",
    "Transit Hub",
  ];

  const events: PublicEvent[] = [];

  for (let day = new Date(startDay); day <= endDay; day.setDate(day.getDate() + 1)) {
    const seed = hashStringToUint32(`${cityName}:${ymd(day)}`);
    const rng = mulberry32(seed);

    // 0–2 events per day with bias toward at least 1
    const roll = rng();
    const count = roll < 0.15 ? 0 : roll < 0.75 ? 1 : 2;
    for (let i = 0; i < count; i++) {
      const baseTitle = pick(rng, titles);
      const category: PublicEventCategory =
        baseTitle.includes("Rally") ? "Political Rally" :
        baseTitle.includes("Parade") ? "Parade" :
        baseTitle.includes("Concert") ? "Concert" :
        baseTitle.includes("Football") ? "Sports" :
        baseTitle.includes("Demonstration") ? "Protest" :
        baseTitle.includes("Meeting") ? "Community" :
        baseTitle.includes("Festival") ? "Festival" :
        "Other";

      const startHour = category === "Sports" ? 18 : category === "Political Rally" || category === "Protest" ? 16 : 11;
      const offset = Math.floor(rng() * 3); // spread within a window
      const st = atTime(day, startHour + offset, rng() < 0.5 ? 0 : 30);
      const durationHours = category === "Sports" ? 3 : category === "Political Rally" || category === "Protest" ? 2 : 4;
      const en = new Date(st);
      en.setHours(st.getHours() + durationHours);

      const baseRisk =
        category === "Political Rally" || category === "Protest" ? 4 :
        category === "Festival" || category === "Concert" ? 3 :
        category === "Sports" ? 3 :
        category === "Parade" ? 2 :
        2;
      const jitter = rng() < 0.2 ? 1 : rng() < 0.35 ? -1 : 0;
      const risk = clampRisk(baseRisk + jitter);

      const attendance =
        category === "Political Rally" || category === "Protest"
          ? 800 + Math.floor(rng() * 2200)
          : category === "Festival" || category === "Concert"
            ? 600 + Math.floor(rng() * 2400)
            : category === "Sports"
              ? 400 + Math.floor(rng() * 1800)
              : 150 + Math.floor(rng() * 800);

      const loc = pick(rng, locations);
      const geo = jitterGeo(seed + i * 101, LOCATION_GEO[loc]);
      events.push({
        id: `evt-${ymd(day)}-${i}-${seed.toString(16)}`,
        title: `${loc} ${baseTitle}`,
        category,
        startTime: isoLocal(st),
        endTime: isoLocal(en),
        locationName: loc,
        address: `${Math.floor(100 + rng() * 900)} ${pick(rng, ["Main St", "Justice Blvd", "Riverfront Way", "Oak Ave", "Pine St"])}`,
        geo,
        expectedAttendance: attendance,
        riskLevel: risk,
        notes:
          category === "Political Rally" || category === "Protest"
            ? "Plan for crowd management and counter-group separation."
            : category === "Parade"
              ? "Expect rolling road closures and pedestrian crossings."
              : "Increased pedestrian/traffic volume expected during peak hours.",
        source: { name: "Mock City Calendar" },
        recommendedPosture:
          risk >= 4
            ? ["Assign supervisor", "Stage 2 units nearby", "Define ingress/egress routes"]
            : risk === 3
              ? ["Traffic control as needed", "1 unit nearby during peak window"]
              : ["Routine monitoring"],
      });
    }
  }

  return events;
}

/**
 * Seed data so the calendar works out of the box.
 * Replace this later with a real municipal events feed.
 */
export function getSeedPublicEvents(now = new Date()): PublicEvent[] {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const inThreeDays = new Date(today);
  inThreeDays.setDate(today.getDate() + 3);
  const seed = hashStringToUint32(`seed:${ymd(today)}`);

  return [
    {
      id: "evt-today-festival",
      title: "Downtown Spring Food Festival",
      category: "Festival",
      startTime: isoLocal(atTime(today, 11, 0)),
      endTime: isoLocal(atTime(today, 18, 0)),
      locationName: "Downtown Plaza",
      address: "Main St & 3rd Ave",
      geo: jitterGeo(seed + 1, LOCATION_GEO["Downtown Plaza"]),
      expectedAttendance: 2500,
      riskLevel: 3,
      notes: "High pedestrian volume, vendor vehicles during setup/teardown.",
      source: { name: "City Events Board" },
      recommendedPosture: [
        "Stage 1 unit near Main St closure points",
        "Coordinate traffic control for vendor loading zones",
        "EMS standby recommended during peak hours",
      ],
    },
    {
      id: "evt-today-rally",
      title: "Civic Square Political Rally",
      category: "Political Rally",
      startTime: isoLocal(atTime(today, 16, 30)),
      endTime: isoLocal(atTime(today, 19, 0)),
      locationName: "Civic Square",
      address: "1200 Justice Blvd",
      geo: jitterGeo(seed + 2, LOCATION_GEO["Civic Square"]),
      expectedAttendance: 1200,
      riskLevel: 4,
      notes: "Potential counter-protest; designate buffer zones and clear ingress/egress routes.",
      source: { name: "Permit Office" },
      recommendedPosture: [
        "Pre-brief crowd management plan and arrest team",
        "Establish separate zones for opposing groups",
        "Request 2 additional units on standby",
      ],
    },
    {
      id: "evt-tomorrow-parade",
      title: "Community Parade (Neighborhood)",
      category: "Parade",
      startTime: isoLocal(atTime(tomorrow, 9, 0)),
      endTime: isoLocal(atTime(tomorrow, 11, 0)),
      locationName: "Oakwood Loop",
      address: "Oakwood Dr to Pine St",
      geo: jitterGeo(seed + 3, LOCATION_GEO["Oakwood Loop"]),
      expectedAttendance: 600,
      riskLevel: 2,
      notes: "Rolling road closures; expect slow traffic and families crossing.",
      source: { name: "Community Association" },
      recommendedPosture: ["Traffic cones and crossing guards at Pine St", "1 unit for route sweep"],
    },
    {
      id: "evt-3days-concert",
      title: "Open-Air Concert Series",
      category: "Concert",
      startTime: isoLocal(atTime(inThreeDays, 19, 0)),
      endTime: isoLocal(atTime(inThreeDays, 22, 0)),
      locationName: "Riverfront Park",
      address: "500 Riverfront Way",
      geo: jitterGeo(seed + 4, LOCATION_GEO["Riverfront Park"]),
      expectedAttendance: 1800,
      riskLevel: 3,
      notes: "Parking overflow likely; monitor for noise complaints post-event.",
      source: { name: "Parks Department" },
      recommendedPosture: ["Coordinate parking enforcement", "1 unit near park exit after 21:30"],
    },
  ];
}

