import { NextRequest, NextResponse } from "next/server";
import { INCIDENT_CATEGORIES } from "@/lib/incidentCategories";
import { getOpenAIClient } from "@/lib/openai";

export async function POST(req: NextRequest) {
  try {
    const openai = getOpenAIClient();
    const { transcript } = await req.json();

    if (!transcript?.trim()) {
      return NextResponse.json({ error: "No transcript provided" }, { status: 400 });
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4.1",
      messages: [
        {
          role: "system",
          content: `You are an emergency call classification AI for Montgomery County PD dispatch center.
Analyze the caller's description and determine if it is a 911 emergency or 311 non-emergency civic call.

You MUST use only these exact incident type values:
${INCIDENT_CATEGORIES.join(", ")}

Return ONLY valid JSON:
{
  "callType": "911" | "311",
  "incidentType": "<one of the exact category values above>",
  "priority": <0-4>,
  "address": "<extracted address, street, or intersection — or 'Unknown Location'>",
  "description": "<1-2 sentence neutral description of the situation>",
  "summary": "<concise operational summary for dispatcher>",
  "department": "<civic department name if 311, e.g. Public Works, Animal Control, Parking Enforcement, Sanitation, Housing Authority — null if 911>",
  "highlights": ["<key fact 1>", "<key fact 2>", "<key fact 3>"],
  "callBullets": ["<complete sentence log entry 1>", "<complete sentence log entry 2>", "<complete sentence log entry 3>"]
}

callBullets must be 3-5 complete, factual sentences extracted from the caller transcript written as police log entries. Each bullet should capture a distinct piece of information (nature of incident, location detail, persons involved, weapons/vehicles, injuries, urgency).

Priority: 0=Critical (life-threatening), 1=High (urgent), 2=Medium, 3=Low, 4=Very Low.
911 calls must always have priority 0-2. 311 calls use priority 3-4.`,
        },
        {
          role: "user",
          content: `Caller transcript: "${transcript}"`,
        },
      ],
      temperature: 0.2,
      max_tokens: 500,
      response_format: { type: "json_object" },
    });

    const result = JSON.parse(response.choices[0].message.content ?? "{}");
    return NextResponse.json(result);
  } catch (err) {
    console.error("simulate-call error:", err);
    return NextResponse.json({ error: "Call processing failed" }, { status: 500 });
  }
}
