# CivicGuard

> AI-powered real-time dispatch command center for city police operations.

CivicGuard is a hackathon project built to demonstrate how AI can augment frontline police dispatch. It ingests live 911/311 incident data, classifies and scores incidents using GPT-4o, and gives dispatchers an intelligent workspace for managing field officers in real time.

---

## Table of Contents

- [Demo](#demo)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Project Structure](#project-structure)
- [API Reference](#api-reference)
- [Design System](#design-system)

---

## Demo

Live data is pulled from Montgomery County, MD's public SODA API every 30 seconds.
AI features require an OpenAI API key (see [Environment Variables](#environment-variables)).

---

## Features

### Live Incident Queue
- Real-time feed from Montgomery County SODA API (150 incidents, 48-hour window)
- Tabbed queue: **Incoming** (911), **Field** (officer reports), **Completed**
- Search, filter by type, priority (P0–P4), status, and time range (1h / 4h / 24h)
- Elapsed time counter per incident, auto-refreshes every 30 seconds

### AI Severity Scoring
- Synchronous scoring engine runs at data ingestion (no API call needed)
- Multi-factor formula: incident category + keyword boost + time factor + location risk + cluster boost
- 9 categories (Violent Crime → score 85, Other → score 20)
- Score clamped 0–100; color-coded: Red (80+), Amber (50–79), Purple (0–49)

### Active Incident Panel
- Full incident detail: ID, type, priority badge, AI score, address, source, elapsed time
- Timestamped incident log with entries from CAD, Dispatch, Caller, and Officer
- Google Maps navigation link
- Outcome buttons: **Confirmed**, **Unable to Locate**, **Gone on Arrival**, **False Alarm**, **Unfounded** — each logged to the incident timeline

### AI Incident Classification
- Click **Analyse** to send the incident log to GPT-4o
- Returns top 2 probable incident types with confidence %, priority, and occurrence timing
- Per-suggestion reasoning shown via clickable ⓘ tooltip
- Overall AI rationale, supporting log evidence, and recommendation in a separate ⓘ tooltip
- User can accept an AI suggestion or override with any type from the full dropdown

### AI Dispatch Assistant
- In-panel chat widget powered by GPT-4o
- Maintains full conversation history (last 12 messages)
- Answers tactical questions: safest route, backup needs, weapons risk, incident summary
- Aware of incident type, address, priority, and current log entries

### Field Reporting via Voice
- Officers click **Field Report** and speak into the microphone
- Web Speech API transcribes voice; GPS coordinates are captured in parallel
- Transcript sent to `/api/field-report` → GPT-4o extracts incident type and priority
- New field incident created and added to the Field tab

### Simulate 911 / 311 Call
- Enter a caller transcript in the Simulate Call modal
- GPT-4o classifies as 911 (emergency) or 311 (non-emergency)
- Extracts incident type, priority, address, description, department, and highlights
- Creates a new incident in the appropriate queue

### Police Report Generation
- Click **Generate Report** on any incident
- GPT-4o produces a structured police report from the full incident log
- Sections: Summary, Timeline, Involved Parties, Officer Observations, Recommended Next Steps
- Download as PDF with one click (jsPDF, no server round-trip)

### Operational Summary
- Auto-generated when an incident is marked **Completed**
- GPT-4o produces a concise 3–5 sentence operational summary from field notes
- Displayed in the incident panel; regenerates if new voice notes are added

### Patrol Heat Map
- Leaflet.js map centered on Montgomery County
- Heat layer shows incident density by geographic cluster
- Individual markers with popup details for in-progress incidents

### Public Events Calendar
- Month-view calendar showing upcoming public events in the area
- Supports crowd management and resource planning awareness

### Theme Toggle
- Dark / light mode toggle, persisted to `localStorage`

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5 |
| UI | React 19 |
| Styling | Tailwind CSS 3 |
| AI | OpenAI GPT-4o via `openai` SDK |
| Maps | Leaflet 1.9 + react-leaflet 5 |
| PDF | jsPDF 4 |
| Icons | lucide-react |
| Fonts | Space Grotesk, JetBrains Mono |

---

## Getting Started

### Prerequisites

- Node.js 20+
- An OpenAI API key

### Installation

```bash
# 1. Clone the repository
git clone <repo-url>
cd CivicGuard

# 2. Install dependencies
npm install

# 3. Configure environment variables
cp .env.example .env.local
# Edit .env.local and add your OPENAI_API_KEY

# 4. Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build for Production

```bash
npm run build
npm run start
```

---

## Environment Variables

All sensitive configuration lives in `.env.local` (git-ignored). Copy `.env.example` to get started.

| Variable | Required | Description |
|---|---|---|
| `OPENAI_API_KEY` | Yes | OpenAI API key — powers all AI features |
| `MONTGOMERY_APP_TOKEN` | No | SODA API app token for higher rate limits |

See `.env.example` for the full template with comments.

---

## Project Structure

```
CivicGuard/
├── app/
│   ├── api/
│   │   ├── caller-callback/     # Voice agent callback handler
│   │   ├── classify-incident/   # AI incident reclassification
│   │   ├── dispatch-assistant/  # Conversational dispatch AI
│   │   ├── field-report/        # Voice-to-structured field report
│   │   ├── generate-report/     # Full police report generation
│   │   ├── incidents/           # Live incident feed (SODA API proxy)
│   │   ├── public-events/       # Public events calendar data
│   │   ├── simulate-call/       # 911/311 call classifier
│   │   └── summarize/           # Operational summary generator
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── CenterPanel.tsx          # Active incident workspace
│   ├── CommandCenterBar.tsx     # Top status bar
│   ├── ContactsModal.tsx        # Emergency contacts
│   ├── Dashboard.tsx            # Root layout and state
│   ├── EventsDrawer.tsx         # Public events calendar drawer
│   ├── IncidentCard.tsx         # Queue list item
│   ├── LiveQueue.tsx            # Left sidebar incident list
│   ├── PatrolHeatmap.tsx        # Leaflet heat map
│   ├── SimulateCall.tsx         # Simulate call modal
│   └── ui/                      # Shared UI primitives
├── hooks/
│   └── useIncidents.ts          # Polling hook for live incidents
├── lib/
│   ├── aiScore.ts               # Synchronous AI severity engine
│   ├── incidentCategories.ts    # 51 valid incident type definitions
│   ├── openai.ts                # Cached OpenAI client factory
│   ├── types.ts                 # Shared TypeScript interfaces
│   └── utils.ts                 # Shared utility functions
├── .env.example                 # Environment variable template
├── REQUIREMENTS.md              # Full product requirements
└── README.md                    # This file
```

---

## API Reference

| Endpoint | Method | Description |
|---|---|---|
| `/api/incidents` | GET | Fetch live incidents from Montgomery County SODA API |
| `/api/classify-incident` | POST | AI reclassification of incident from log entries |
| `/api/dispatch-assistant` | POST | Conversational AI chat for dispatcher queries |
| `/api/field-report` | POST | Convert voice transcript to structured incident |
| `/api/generate-report` | POST | Generate full police report from incident log |
| `/api/simulate-call` | POST | Classify caller transcript as 911 or 311 |
| `/api/summarize` | POST | Generate operational summary from field notes |
| `/api/public-events` | GET | Fetch public events for calendar view |
| `/api/caller-callback` | POST | Voice agent callback handler |

---

## Design System

### Color Palette

| Role | Color | Hex |
|---|---|---|
| Emergency / 911 | Red | `#FF3D5A` |
| Civic / 311 | Amber | `#FFAA00` |
| Field / Officer | Green | `#00E87A` |
| Dispatch | Blue | `#00B8FF` |
| AI Core | Purple | `#B06DFF` |
| Background | Deep Navy | `#03050D` |
| Surface | Dark Navy | `#0F1117` |

### Priority Levels

| Level | Label | Color |
|---|---|---|
| P0 | Critical | `#FF3D5A` |
| P1 | High | `#FF6B35` |
| P2 | Elevated | `#FFAA00` |
| P3 | Moderate | `#00B8FF` |
| P4 | Low | `#00E87A` |

### Typography

- **UI / Labels** — Space Grotesk
- **IDs / Codes / Monospace** — JetBrains Mono

---

## Hackathon Notes

This project was built for a hackathon focused on AI applications in public safety. The goal is to show how real-time data + LLMs can meaningfully reduce cognitive load for dispatch operators — surfacing what matters, flagging anomalies, and drafting documentation automatically.

The live data source is Montgomery County, MD's open SODA API. All AI inference is handled via OpenAI's GPT-4o model. No personally identifiable information is stored or transmitted beyond what the public API already exposes.
