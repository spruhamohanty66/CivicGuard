import { NextRequest, NextResponse } from "next/server";
import { getOpenAIClient } from "@/lib/openai";

export async function POST(req: NextRequest) {
  try {
    const client = getOpenAIClient();
    const { incidentType, address, sector, policeNotes } = await req.json();

    const notesText =
      Array.isArray(policeNotes) && policeNotes.length > 0
        ? policeNotes.map((n: { time: string; text: string }) => `[${n.time}] ${n.text}`).join("\n")
        : "No field updates recorded.";

    const prompt = `You are a police dispatch system. Generate a concise operational incident summary.

Incident Type: ${incidentType}
Location: ${address}
Patrol Sector: ${sector}
Field Updates:
${notesText}

Rules:
- Neutral, factual, third-person tone
- No opinions or emotional language
- Reference the police unit by sector, not individuals
- 3-5 sentences max
- Format like official police log entries`;

    const response = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 200,
      temperature: 0.3,
    });

    const summary = response.choices[0].message.content ?? "Summary unavailable.";
    return NextResponse.json({ summary });
  } catch (err) {
    console.error("summarize error:", err);
    return NextResponse.json({ error: "Summary generation failed" }, { status: 500 });
  }
}
