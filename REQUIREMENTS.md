# CivicGuard — Product Requirements Document

> This file is the single source of truth for all product decisions.
> Update this file when requirements change, then implement accordingly.

---

## 1. Project Overview

**Name:** CivicGuard
**Type:** Real-time AI-powered police dispatch command center
**Audience:** City police command center operators and field dispatchers
**Data Source:** Montgomery County, MD — SODA Open Data API
**AI Provider:** OpenAI GPT-4o

---

## 2. Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript 5 |
| UI Runtime | React 19 |
| Styling | Tailwind CSS 3 |
| AI SDK | openai 6 (GPT-4o) |
| Maps | Leaflet 1.9 + react-leaflet 5 |
| PDF | jsPDF 4 |
| Icons | lucide-react |
| Fonts | Space Grotesk, JetBrains Mono |

---

## 3. Design System

### 3.1 Theme

| Token | Value |
|---|---|
| Background | `#03050D` |
| Surface / Cards | `#0F1117` |
| Border | `1px solid rgba(255,255,255,0.08)` |

Dark mode is the default and primary theme. A light mode toggle is available and persists to `localStorage`.

### 3.2 Typography

| Usage | Font |
|---|---|
| UI labels, body text | Space Grotesk |
| IDs, codes, monospace tags, timestamps | JetBrains Mono |

### 3.3 Color System

| Role | Color | Hex |
|---|---|---|
| Emergency / 911 | Red | `#FF3D5A` |
| Civic / 311 | Amber | `#FFAA00` |
| Field / Officer | Green | `#00E87A` |
| Dispatch Output | Blue | `#00B8FF` |
| AI Core | Purple | `#B06DFF` |
| Data Feeds | Cyan | `#00FFE1` |
| Analytics | Pink | `#FF5FCB` |

### 3.4 Priority Color Scale

| Priority | Label | Color |
|---|---|---|
| P0 | Critical | `#FF3D5A` |
| P1 | High | `#FF6B35` |
| P2 | Elevated | `#FFAA00` |
| P3 | Moderate | `#00B8FF` |
| P4 | Low | `#00E87A` |

### 3.5 Visual Behavior

- Priority numbers use JetBrains Mono, large and color-coded
- Subtle glow on high-priority cards (`box-shadow` at 0.2 opacity)
- Animated pulsing dot on P0 / P1 (critical) incidents
- AI score badge color-coded: Red (80+), Amber (50–79), Green (0–49)

---

## 4. Layout

### 4.1 Structure

Three-column full-viewport layout:

```
┌─────────────────────────────────────────────────────────┐
│                  CommandCenterBar (top)                  │
├────────────────┬──────────────────────┬─────────────────┤
│   LiveQueue    │    CenterPanel       │  PatrolHeatmap  │
│   (w-80)       │    (flex-1)          │  (collapsible)  │
│   Left sidebar │    Active incident   │  Map overlay    │
└────────────────┴──────────────────────┴─────────────────┘
```

- The right panel (PatrolHeatmap) is collapsible via a minimize button
- Layout is non-scrollable at the viewport level; only internal panels scroll

---

## 5. Live Incident Feed

### 5.1 Data Source

- **API:** Montgomery County SODA endpoint
  - `https://data.montgomerycountymd.gov/resource/98cc-bc7d.json`
- **Auth:** Optional `MONTGOMERY_APP_TOKEN` in environment for higher rate limits
- **Polling interval:** 2 minutes (120 seconds)
- **Volume:** 150 incidents, filtered to past 48 hours
- **Sort:** `start_time DESC` (most recent first)

### 5.2 Incident Schema

| Field | Type | Source |
|---|---|---|
| `id` | string | Generated |
| `incidentId` | string | SODA `incident_id` |
| `type` | string | SODA `initial_type` |
| `address` | string | SODA `address` |
| `startTime` | ISO string | SODA `start_time` |
| `createdAt` | ISO string | SODA `created_at` |
| `source` | `"911"` | Hard-coded for SODA feed |
| `priority` | 0–4 | SODA `priority` |
| `status` | string | SODA `status` |
| `district` | string | SODA `district` |
| `geo` | `{lat, lng}` | SODA `latitude` / `longitude` |
| `aiScore` | 0–100 | Computed by `lib/aiScore.ts` |
| `aiCategory` | string | Computed by `lib/aiScore.ts` |

### 5.3 Polling Hook (`hooks/useIncidents.ts`)

- Returns: `{ incidents, loading, error, lastUpdated, refetch }`
- Auto-refetches on a 30-second interval
- `lastUpdated` timestamp displayed in the queue header as "X seconds ago"

---

## 6. AI Severity Score Engine (`lib/aiScore.ts`)

Synchronous calculation — runs at data ingestion, requires no API call.

### 6.1 Formula

```
score = baseScore + keywordBoost + timeFactor + locationRisk + clusterBoost
score = clamp(score, 0, 100)
```

### 6.2 Base Scores by Category

| Category | Base Score |
|---|---|
| Violent Crime | 85 |
| Emergency Response | 70 |
| Mental Health | 60 |
| Property Crime | 65 |
| Suspicious Activity | 55 |
| Traffic | 50 |
| Public Disturbance | 45 |
| Animal | 30 |
| Other | 20 |

### 6.3 Keyword Boosts

| Keyword | Boost |
|---|---|
| ACTIVE SHOOTER | +20 |
| SHOOTING, STABBING | +15 each |
| SUICIDE | +12 |
| WEAPON, ROBBERY, CARJACK, OVERDOSE, PEDESTRIAN STRUCK, BURGLARY JUST OCCURRED | +10 each |

### 6.4 Time Adjustments

| Phrase | Adjustment |
|---|---|
| JUST OCCURRED | +10 |
| OCCURRED EARLIER | −10 |
| FOLLOW UP | −20 |

### 6.5 Other Factors

- **Location Risk:** Fixed +4 (placeholder for future geo-zone weighting)
- **Cluster Boost:** +12 if `REPEAT` appears in incident type

---

## 7. Live Queue (`components/LiveQueue.tsx`)

### 7.1 Tabs

| Tab | Contents |
|---|---|
| Incoming | Live 911 incidents from SODA API + simulated calls |
| Field | Officer-created field reports (via voice) |
| Completed | Incidents marked as completed |

### 7.2 Filters

- **Search:** Free-text match on incident type and address
- **Type:** Dropdown of valid incident categories
- **Priority:** Slider / select for P1–P3
- **Status:** Active / all
- **Time range:** Last 1h / 4h / 24h

### 7.3 Incident Card (`components/IncidentCard.tsx`)

Each card displays:
- Left accent border (color by source: red=911, amber=311, green=field)
- Priority badge (P0–P4, color-coded)
- Incident type (bold, uppercase)
- Incident ID (JetBrains Mono)
- Address with map-pin icon
- Elapsed time (HH:MM:SS, live counter)
- AI score bar + numeric value
- Pulsing dot for P0 incidents

---

## 8. Active Incident Panel (`components/CenterPanel.tsx`)

The center panel renders the full detail view for a selected incident.

### 8.1 Header (sticky)

- Close button
- Incident ID (mono)
- Priority badge (Px + label)
- AI score badge (color-coded)
- Elapsed clock (HH:MM:SS, live)
- Incident type (large, uppercase)
- Source badge (via 911 / via 311 / via field)
- Caller phone link

### 8.2 Body (two-column)

**Left column:**
- Location map panel (grid background, navigate button → Google Maps)
- Accept Task button (marks officer en route, logs entry)
- Request Backup button
- Outcome buttons (see section 14)
- Incident info: AI score breakdown, critical notes, location history

**Right column:**
- AI Classification widget (shown after Analyse is clicked)
- Incident Log (timestamped entries from CAD, Dispatch, Caller, Officer)
- Generate Report button
- Analyse button
- Dispatcher AI Chat widget

### 8.3 Incident Log

Entries are rendered newest-first with source labels:
- `CAD` — system-generated entry at incident creation
- `Dispatch` — dispatch system notes
- `Alert` — critical system alerts (red)
- `Caller` — notes from simulated call transcripts
- `Officer` — manually added field notes / voice notes

---

## 9. AI Incident Classification (`/api/classify-incident`)

### 9.1 Trigger

Dispatcher clicks the **Analyse** button in the incident log header.

### 9.2 Input

- `currentIncidentType`: current type string
- `logEntries`: array of `{ timestamp, source, message }` from the incident log

### 9.3 AI Processing

- Model: `gpt-4o`, `temperature: 0.2`, JSON response mode
- System prompt validates against the 51 `INCIDENT_CATEGORIES`
- Returns top 2 classification suggestions ranked by confidence

### 9.4 Response Schema

```json
{
  "changed": boolean,
  "original_type": "string",
  "suggested_type": "string",
  "reason": "string",
  "supporting_log": "string",
  "recommendation": "string",
  "current_incident_type": "string",
  "incident_type_change_required": boolean,
  "key_facts_detected": ["string"],
  "top_classification_suggestions": [
    {
      "incident_type": "string",
      "priority": 0-4,
      "occurrence_timing": "JUST_OCCURRED | OCCURRED_EARLIER",
      "confidence": 0-100,
      "reason": "string"
    }
  ]
}
```

### 9.5 UI Behaviour

- No popup — results render inline in the **AI Classification** widget
- Top 2 suggestions shown as selectable cards with confidence bar
- Each card has an ⓘ button showing the per-suggestion reasoning as a tooltip
- Widget header has an ⓘ button showing overall reason, supporting log, recommendation
- User selects a suggestion card OR picks any type from the **Override** dropdown
- **Apply Selection** button: logs the change and calls `onUpdateIncident`
- **Ignore** button: dismisses the widget

---

## 10. Dispatcher AI Chat (`/api/dispatch-assistant`)

### 10.1 Trigger

Dispatcher opens the **Ask AI** panel at the bottom of the right column.

### 10.2 Input

- `incident`: `{ incidentId, type, address, priority, locationHistory }`
- `logEntries`: current incident log
- `conversationHistory`: last N message pairs
- `userQuestion`: current dispatcher query

### 10.3 AI Processing

- Model: `gpt-4o`, `temperature: 0.2`, `max_tokens: 350`
- Maintains up to 12 messages of conversation history
- System-prompted to provide tactical dispatch advice

### 10.4 Response

- `{ answer: string }` — displayed in the chat panel
- Chat history persists for the lifetime of the incident selection

---

## 11. Field Reporting via Voice (`/api/field-report`)

### 11.1 Trigger

Officer clicks **Field Report** button in the LiveQueue header.

### 11.2 Flow

1. Browser requests microphone permission
2. Web Speech API records and transcribes the officer's spoken report
3. GPS coordinates captured in parallel via `navigator.geolocation`
4. Transcript sent to `/api/field-report`
5. GPT-4o extracts `incidentType` and `priority`
6. New `Incident` object created with `source: "field"` and GPS data
7. Added to the Field tab in the queue

### 11.3 API Input / Output

Input: `{ transcript: string }`
Output: `{ incidentType: string, priority: 0–4 }`

---

## 12. Simulate 911 / 311 Call (`/api/simulate-call`)

### 12.1 Trigger

Dispatcher clicks **Simulate Call** in the CommandCenterBar.

### 12.2 Flow

1. Modal opens with a transcript input field
2. Dispatcher types or pastes a caller's spoken message
3. Sent to `/api/simulate-call`
4. GPT-4o classifies and extracts structured data
5. New incident created in the appropriate queue tab (911 → Incoming, 311 → Incoming)

### 12.3 Response Schema

```json
{
  "callType": "911 | 311",
  "incidentType": "string (from INCIDENT_CATEGORIES)",
  "priority": 0-4,
  "address": "string",
  "description": "string",
  "summary": "string",
  "department": "string | null",
  "highlights": ["string"],
  "callBullets": ["string"]
}
```

---

## 13. Police Report Generation (`/api/generate-report`)

### 13.1 Trigger

Dispatcher clicks **Generate Report** in the incident log header.

### 13.2 Input

- `incident`: core incident fields
- `logEntries`: full timestamped log

### 13.3 AI Processing

- Model: `gpt-4o`, `temperature: 0.2`, `max_tokens: 1200`
- Graceful fallback report if OpenAI call fails

### 13.4 Response Schema

```json
{
  "incident_summary": "string",
  "timeline_of_events": ["string"],
  "involved_parties": ["string"],
  "officer_observations": ["string"],
  "recommended_next_steps": ["string"]
}
```

### 13.5 PDF Download

- Rendered client-side via jsPDF (no server round-trip)
- Filename: `{incidentId}-report.pdf`
- Sections: header, summary, timeline, parties, observations, next steps

---

## 14. Incident Outcome Buttons

Displayed in the bottom action bar of the incident panel.

| Outcome | Icon | Color |
|---|---|---|
| Confirmed | CheckCircle2 | Green `#00E87A` |
| Unable to Locate | MapPinOff | Amber `#FFAA00` |
| Gone on Arrival | LogOut | Blue `#00B8FF` |
| False Alarm | BellOff | Orange `#FF6B35` |
| Unfounded | Ban | White/dim |

- Clicking an outcome shows a confirmation modal
- On confirm: logs `"Outcome recorded: <outcome>"` to the incident timeline
- Once an outcome is set, other outcomes are disabled (only the selected one remains active)

---

## 15. Mark as Completed

### 15.1 Trigger

Dispatcher clicks **Completed** in the bottom action bar.

### 15.2 Flow

1. Confirmation modal appears
2. On confirm:
   - Logs `"Incident marked as completed"` to the incident timeline
   - Incident moved to the **Completed** tab
   - AI classification runs automatically
   - Operational summary generated via `/api/summarize`

### 15.3 Operational Summary (`/api/summarize`)

- Model: `gpt-4o`, `temperature: 0.3`, `max_tokens: 200`
- Input: `{ incidentType, address, sector, policeNotes }`
- Output: `{ summary: string }` — 3–5 sentence factual operational summary
- Regenerates automatically if new voice notes are added post-completion

---

## 16. Voice Notes

### 16.1 Trigger

Officer clicks the microphone FAB (floating action button) in the bottom action bar.

### 16.2 Flow

1. Web Speech API activates microphone
2. Transcript captured
3. If transcript contains a classify keyword (`analyze`, `analyse`, `classify`, `reclassify`, `classification`) → triggers AI classification instead of adding a note
4. Otherwise: note added to the incident log as an `Officer` entry

---

## 17. Patrol Heat Map (`components/PatrolHeatmap.tsx`)

- Leaflet.js map centered on Montgomery County
- `leaflet.heat` plugin renders density layer from incident `geo` coordinates
- Individual markers for each incident with popup (ID, type, address)
- In-progress incidents highlighted with distinct marker style
- Collapsible panel (minimize/maximize button)
- SSR-safe via Next.js `dynamic()` import with `{ ssr: false }`

---

## 18. Public Events Calendar

- Month-view calendar showing upcoming public events
- Data from `/api/public-events` (mock data, configurable date range)
- Supports crowd-management and resource planning awareness
- Accessible from the CommandCenterBar calendar button

---

## 19. Incident Categories (`lib/incidentCategories.ts`)

51 valid categories across 9 groups:

| Group | Categories |
|---|---|
| Violent Crimes | Assault, Robbery, Shooting, Stabbing, Sexual Assault, Carjacking, Abduction/Kidnapping, Domestic Violence, Harassment/Stalking/Threats |
| Property Crimes | Burglary, Theft/Larceny, Theft From Auto, Stolen Vehicle, Vandalism/Damage/Mischief, Fraud/Deception |
| Public Safety | Suspicious Activity, Disturbance/Nuisance, Trespassing, Noise Complaint |
| Traffic | Traffic Incident, Traffic Violation, Driving Under the Influence, Pedestrian Struck |
| Welfare & Health | Check Welfare, Mental Health Incident, Suicidal Person, Overdose, Deceased Person |
| Missing / Wanted | Missing Person, Wanted Person/Vehicle |
| Animal | Animal Complaint, Animal Rescue, Animal Abuse, Vicious Animal |
| Dangerous Threats | Weapons/Firearms, Bomb Threat/Suspicious Package, Active Shooter, Hazardous Material |
| Operational | Alarm, Administrative/Follow-Up, Miscellaneous |

---

## 20. Environment & Secrets

All sensitive configuration must live in `.env.local` (git-ignored).
Never hard-code API keys or tokens in source files.

| Variable | Required | Description |
|---|---|---|
| `OPENAI_API_KEY` | Yes | Powers all AI features |
| `MONTGOMERY_APP_TOKEN` | No | Increases SODA API rate limit |

See `.env.example` for the annotated template.

---

## 21. Non-Functional Requirements

| Requirement | Target |
|---|---|
| Incident feed refresh | Every 30 seconds |
| AI classification latency | < 5 seconds (gpt-4o) |
| PDF generation | Client-side, < 2 seconds |
| Timezone | GMT-6 (Montgomery, AL) — no DST |
| Browser support | Chrome (required for Web Speech API) |
| No PII storage | No personal data stored server-side |

---

## 22. Out of Scope

- User authentication / role-based access
- Real radio integration
- Persistent database (all state is in-memory)
- Mobile / native app
