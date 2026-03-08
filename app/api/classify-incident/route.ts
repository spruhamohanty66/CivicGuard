import { NextRequest, NextResponse } from "next/server";
import { INCIDENT_CATEGORIES } from "@/lib/incidentCategories";
import { getOpenAIClient } from "@/lib/openai";

type IncomingLogEntry = {
  timestamp?: string;
  time?: string;
  source?: string;
  message?: string;
  text?: string;
};

export async function POST(req: NextRequest) {
  try {
    console.log("🔍 classify-incident called");
    const body = await req.json();
    console.log("🔍 body received:", JSON.stringify(body));
    const openai = getOpenAIClient();
    const { currentIncidentType, currentType, logEntries, policeNotes } = body;
    const normalizedCurrentType =
      typeof currentIncidentType === "string" && currentIncidentType.trim()
        ? currentIncidentType.trim()
        : typeof currentType === "string" && currentType.trim()
          ? currentType.trim()
          : "";
    if (!normalizedCurrentType) {
      return NextResponse.json(
        { error: "Missing currentIncidentType in request body" },
        { status: 400 }
      );
    }
    const entries: IncomingLogEntry[] = Array.isArray(logEntries)
      ? logEntries
      : Array.isArray(policeNotes)
        ? policeNotes
        : [];
    console.log("Body:", { currentIncidentType: normalizedCurrentType, logEntries: entries.length });

    if (!entries || entries.length === 0) {
      return NextResponse.json({ error: "No police notes provided" }, { status: 400 });
    }

    const logText = entries
      .map((n: IncomingLogEntry) => {
        const time = n.timestamp ?? n.time ?? "--:--:--";
        const source = n.source ?? "Officer";
        const message = n.message ?? n.text ?? "";
        return `[${time}] ${source}: ${message}`;
      })
      .join("\n");

    const systemPrompt = `You are a police dispatch assistant for incident validation and reclassification.
Analyze timeline logs and determine whether the incident type has changed from what was originally filed.

Valid incident categories: ${INCIDENT_CATEGORIES.join(", ")}

Return ONLY valid JSON in this exact structure (no extra keys, no markdown):
{
  "changed": true,
  "original_type": "<original type>",
  "suggested_type": "<best updated type from valid categories>",
  "reason": "<brief explanation>",
  "supporting_log": "<direct quote or summary of log lines supporting change>",
  "recommendation": "<action recommendation>",
  "current_incident_type": "<original type repeated>",
  "incident_type_change_required": true,
  "key_facts_detected": ["<fact 1>", "<fact 2>"],
  "top_classification_suggestions": [
    {
      "incident_type": "<type from valid categories>",
      "priority": 1,
      "occurrence_timing": "JUST_OCCURRED",
      "confidence": 85,
      "reason": "<why this type fits>"
    }
  ]
}

Rules:
- top_classification_suggestions must contain 1 to 3 entries ranked by confidence.
- priority must be an integer 0–4 (0=CRITICAL, 1=HIGH, 2=ELEVATED, 3=MODERATE, 4=LOW).
- occurrence_timing must be exactly "JUST_OCCURRED" or "OCCURRED_EARLIER".
- confidence must be an integer 0–100.
- key_facts_detected must be an array of strings (can be empty []).
- All fields are required.`;

    const userPrompt = `You are a police dispatch assistant. The incident was originally reported as: "${normalizedCurrentType}".

Below are the timestamped officer log entries:
${logText}

Based on the logs, has the nature of the incident changed? If yes:
- State what the incident now appears to be
- Quote the specific log entry or entries that indicate the change
- Recommend updating the incident category
- Suggest a new incident type/label

Ensure suggested_type is one of the valid incident categories.`;

    let response;
    try {
      response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: 900,
        response_format: { type: "json_object" },
      });
      console.log("OpenAI raw:", response.choices[0]?.message?.content ?? "");
    } catch (openaiErr) {
      console.error("classify-incident OpenAI request failed:", openaiErr);
      const errorInfo =
        openaiErr && typeof openaiErr === "object"
          ? (openaiErr as { code?: string; status?: number; message?: string })
          : {};
      const isInvalidKey =
        errorInfo.code === "invalid_api_key" || errorInfo.status === 401;
      return NextResponse.json(
        {
          error: isInvalidKey
            ? "OpenAI API key is invalid. Update OPENAI_API_KEY in .env.local and restart the dev server."
            : "OpenAI classification request failed",
          code: errorInfo.code ?? null,
        },
        { status: isInvalidKey ? 401 : 502 }
      );
    }

    const content = response.choices[0].message.content ?? "{}";
    const normalizedContent = content
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    let result: Record<string, unknown>;
    try {
      result = JSON.parse(normalizedContent) as Record<string, unknown>;
    } catch (parseErr) {
      console.error("classify-incident invalid JSON from OpenAI:", {
        parseErr,
        content,
      });
      return NextResponse.json(
        { error: "Invalid JSON returned by classification model" },
        { status: 502 }
      );
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error("classify-incident error:", err);
    return NextResponse.json({ error: "Classification failed" }, { status: 500 });
  }
}
