import { NextRequest, NextResponse } from "next/server";
import { getOpenAIClient } from "@/lib/openai";

type DispatchAssistantMessage = {
  role?: string;
  content?: string;
};

type DispatchLogEntry = {
  timestamp?: string;
  source?: string;
  message?: string;
};

type DispatchIncident = {
  type?: string;
  address?: string;
  priority?: number;
  locationHistory?: unknown;
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const openai = getOpenAIClient();

    const incident: DispatchIncident = (body?.incident ?? {}) as DispatchIncident;
    const logEntries: DispatchLogEntry[] = Array.isArray(body?.logEntries) ? body.logEntries : [];
    const userQuestion =
      typeof body?.userQuestion === "string" ? body.userQuestion.trim() : "";
    const incomingHistory: DispatchAssistantMessage[] = Array.isArray(body?.conversationHistory)
      ? body.conversationHistory
      : [];

    if (!userQuestion) {
      return NextResponse.json({ error: "Missing userQuestion" }, { status: 400 });
    }

    const conversationHistory = incomingHistory
      .filter(
        (m) =>
          (m?.role === "assistant" || m?.role === "user") &&
          typeof m?.content === "string" &&
          m.content.trim().length > 0
      )
      .slice(-12)
      .map((m) => ({
        role: m.role as "assistant" | "user",
        content: (m.content ?? "").trim(),
      }));

    const logsAsText = logEntries
      .map((l) => `[${l.timestamp ?? "--:--:--"}] ${l.source ?? "Officer"}: ${l.message ?? ""}`)
      .join("\n");

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are an AI assistant for police dispatchers. You have full context of this incident:
      
Incident: ${incident.type ?? "Unknown"} at ${incident.address ?? "Unknown"}
Priority: ${typeof incident.priority === "number" ? incident.priority : "Unknown"}
Location History: ${JSON.stringify(incident.locationHistory ?? [])}
Log entries: ${logsAsText}

Answer dispatcher questions concisely and professionally.
Suggest tactical advice, flag risks, recommend resources.
If data is missing, explicitly state what is unknown instead of guessing.`,
        },
        ...conversationHistory,
        { role: "user", content: userQuestion },
      ],
      temperature: 0.2,
      max_tokens: 350,
    });

    const answer = completion.choices[0]?.message?.content?.trim();
    if (!answer) {
      return NextResponse.json({ error: "Empty assistant response" }, { status: 502 });
    }

    return NextResponse.json({ answer });
  } catch (err) {
    console.error("dispatch-assistant error:", err);
    const errorInfo =
      err && typeof err === "object"
        ? (err as { code?: string; status?: number })
        : {};
    const isInvalidKey = errorInfo.code === "invalid_api_key" || errorInfo.status === 401;

    return NextResponse.json(
      {
        error: isInvalidKey
          ? "OpenAI API key is invalid. Update OPENAI_API_KEY in .env.local and restart the dev server."
          : "Dispatch assistant failed",
      },
      { status: isInvalidKey ? 401 : 500 }
    );
  }
}

