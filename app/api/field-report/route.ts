import { NextRequest, NextResponse } from "next/server";
import { getOpenAIClient } from "@/lib/openai";

export async function POST(req: NextRequest) {
  try {
    const client = getOpenAIClient();
    const { transcript } = await req.json();

    const prompt = `You are a police dispatch AI. Extract the incident type and priority from this officer's voice report.

Voice report: "${transcript}"

Respond ONLY with valid JSON in this exact format:
{
  "incidentType": "<short incident type, e.g. Assault, Traffic Stop, Suspicious Activity>",
  "priority": <number 0-4, where 0=most critical, 4=lowest>
}

Priority guide: 0=life threatening, 1=urgent violent, 2=serious, 3=moderate, 4=low/routine.`;

    const response = await client.chat.completions.create({
      model: "gpt-4.1",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 100,
      temperature: 0.1,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0].message.content ?? "{}";
    const parsed = JSON.parse(content);

    return NextResponse.json({
      incidentType: parsed.incidentType ?? "Unknown Incident",
      priority: typeof parsed.priority === "number" ? parsed.priority : 3,
    });
  } catch (err) {
    console.error("field-report error:", err);
    return NextResponse.json({ error: "Field report processing failed" }, { status: 500 });
  }
}
