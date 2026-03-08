import { NextRequest, NextResponse } from "next/server";
import { getOpenAIClient } from "@/lib/openai";

type ReportLogEntry = {
  timestamp?: string;
  source?: string;
  message?: string;
};

function buildFallbackReport(
  incident: Record<string, unknown>,
  logEntries: ReportLogEntry[],
  reason: string
) {
  const timeline = logEntries.map((e) => {
    const ts = e.timestamp ?? "--:--:--";
    const src = e.source ?? "Officer";
    const msg = e.message ?? "";
    return `[${ts}] ${src}: ${msg}`;
  });
  const officerObservations = logEntries
    .filter((e) => (e.source ?? "").toLowerCase() === "officer")
    .slice(0, 6)
    .map((e) => e.message ?? "Observation recorded");
  const parties = [
    "Dispatch unit",
    "Reporting caller",
    "Responding officer(s)",
  ];
  return {
    incident_summary:
      `Automated fallback report generated because OpenAI was unavailable (${reason}). ` +
      `Incident ${String(incident.incidentId ?? "Unknown")} is currently categorized as ${String(
        incident.type ?? "Unknown"
      )} at ${String(incident.address ?? "Unknown address")}.`,
    timeline_of_events: timeline.length > 0 ? timeline : ["Not established from logs"],
    involved_parties: parties,
    officer_observations:
      officerObservations.length > 0
        ? officerObservations
        : ["Not established from logs"],
    recommended_next_steps: [
      "Validate incident classification with supervisor review.",
      "Confirm involved parties and statements in official case file.",
      "Re-run AI report generation once OpenAI service/quota is restored.",
    ],
    generated_by: "fallback",
  };
}

export async function POST(req: NextRequest) {
  try {
    const client = getOpenAIClient();
    const { incident, logEntries } = await req.json();

    if (!incident) {
      return NextResponse.json({ error: "Missing incident details" }, { status: 400 });
    }
    if (!Array.isArray(logEntries) || logEntries.length === 0) {
      return NextResponse.json({ error: "No log entries provided" }, { status: 400 });
    }

    const timelineText = (logEntries as ReportLogEntry[])
      .map((e) => {
        const ts = e.timestamp ?? "--:--:--";
        const src = e.source ?? "Officer";
        const msg = e.message ?? "";
        return `[${ts}] ${src}: ${msg}`;
      })
      .join("\n");

    const prompt = `You are a police dispatch reporting assistant.
Generate a structured police report as JSON only.

Incident details:
- Incident ID: ${incident.incidentId ?? "Unknown"}
- Incident Type: ${incident.type ?? "Unknown"}
- Priority: ${incident.priority ?? "Unknown"}
- Address: ${incident.address ?? "Unknown"}
- District: ${incident.district ?? "Unknown"}
- Source: ${incident.source ?? "Unknown"}
- Reported Time: ${incident.startTime ?? "Unknown"}

Log entries:
${timelineText}

Return strict JSON with this schema:
{
  "incident_summary": "<single paragraph summary>",
  "timeline_of_events": ["<event 1>", "<event 2>", "<event 3>"],
  "involved_parties": ["<party 1>", "<party 2>"],
  "officer_observations": ["<observation 1>", "<observation 2>"],
  "recommended_next_steps": ["<step 1>", "<step 2>", "<step 3>"]
}

Rules:
- Neutral, factual police-report tone
- Use concise statements
- If a section has low evidence, state "Not established from logs"
- Do not include markdown fences or extra text`;

    let completion;
    try {
      completion = await client.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        response_format: { type: "json_object" },
        max_tokens: 1200,
      });
    } catch (openaiErr) {
      console.error("generate-report OpenAI request failed:", openaiErr);
      const errorInfo =
        openaiErr && typeof openaiErr === "object"
          ? (openaiErr as { code?: string; status?: number })
          : {};
      const isInvalidKey =
        errorInfo.code === "invalid_api_key" || errorInfo.status === 401;
      const isQuota =
        errorInfo.code === "insufficient_quota" || errorInfo.status === 429;
      const fallbackReason = isInvalidKey
        ? "invalid_api_key"
        : isQuota
          ? "insufficient_quota"
          : "openai_unavailable";
      return NextResponse.json(
        buildFallbackReport(
          incident as Record<string, unknown>,
          logEntries as ReportLogEntry[],
          fallbackReason
        )
      );
    }

    const raw = completion.choices[0].message.content ?? "{}";
    const normalized = raw
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(normalized) as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON returned by report model" },
        { status: 502 }
      );
    }

    return NextResponse.json(parsed);
  } catch (err) {
    console.error("generate-report error:", err);
    return NextResponse.json(
      { error: "Report generation failed" },
      { status: 500 }
    );
  }
}
