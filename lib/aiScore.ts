// AI Score Engine
// Computed at parse time — pure synchronous, zero latency.

export type IncidentCategory =
  | "Violent Crime"
  | "Property Crime"
  | "Suspicious Activity"
  | "Traffic"
  | "Public Disturbance"
  | "Mental Health"
  | "Emergency Response"
  | "Animal"
  | "Other";

const BASE_SCORES: Record<IncidentCategory, number> = {
  "Violent Crime": 85,
  "Property Crime": 65,
  "Suspicious Activity": 55,
  "Traffic": 50,
  "Public Disturbance": 45,
  "Mental Health": 60,
  "Emergency Response": 70,
  "Animal": 30,
  "Other": 20,
};

function categorize(type: string): IncidentCategory {
  const t = type.toUpperCase();

  if (t.includes("SHOOT") || t.includes("STAB") || t.includes("ASSAULT") ||
      t.includes("ROBBERY") || t.includes("RAPE") || t.includes("CARJACK") ||
      t.includes("WEAPON"))
    return "Violent Crime";

  if (t.includes("BURGLARY") || t.includes("THEFT") || t.includes("FRAUD") ||
      t.includes("VANDALISM") || t.includes("TRESPASS"))
    return "Property Crime";

  if (t.includes("SUSPICIOUS") || t.includes("WANTED") || t.includes("INVESTIGATION"))
    return "Suspicious Activity";

  if (t.includes("TRAFFIC") || t.includes("DUI") || t.includes("PEDESTRIAN"))
    return "Traffic";

  if (t.includes("NOISE") || t.includes("DISTURBANCE") || t.includes("FIREWORKS"))
    return "Public Disturbance";

  if (t.includes("MENTAL") || t.includes("SUICIDE") || t.includes("WELFARE") ||
      t.includes("OVERDOSE"))
    return "Mental Health";

  if (t.includes("RESCUE") || t.includes("HAZARD") || t.includes("TRANSPORT"))
    return "Emergency Response";

  if (t.includes("ANIMAL"))
    return "Animal";

  return "Other";
}

function keywordBoost(type: string): number {
  const t = type.toUpperCase();
  if (t.includes("ACTIVE SHOOTER"))       return 20;
  if (t.includes("SHOOTING") || t.includes("STABBING")) return 15;
  if (t.includes("CARJACK") || t.includes("ROBBERY"))   return 10;
  if (t.includes("WEAPON"))               return 10;
  if (t.includes("SUICIDE"))              return 12;
  if (t.includes("OVERDOSE"))             return 10;
  if (t.includes("PEDESTRIAN STRUCK"))    return 10;
  if (t.includes("BURGLARY JUST OCCURRED")) return 10;
  return 0;
}

function timeFactor(type: string): number {
  const t = type.toUpperCase();
  if (t.includes("JUST OCCURRED"))  return 10;
  if (t.includes("OCCURRED EARLIER")) return -10;
  if (t.includes("FOLLOW UP"))      return -20;
  return 0;
}

// Fixed medium location risk — will be dynamic when geo risk zones are configured
const LOCATION_RISK = 4;

function clusterBoost(type: string): number {
  return type.toUpperCase().includes("REPEAT") ? 12 : 0;
}

export interface AIScoreResult {
  score: number;
  category: IncidentCategory;
}

export function calculateAIScore(type: string): AIScoreResult {
  const category = categorize(type);
  const raw =
    BASE_SCORES[category] +
    keywordBoost(type) +
    timeFactor(type) +
    LOCATION_RISK +
    clusterBoost(type);

  return {
    score: Math.max(0, Math.min(100, raw)),
    category,
  };
}
