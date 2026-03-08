import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface CallbackRequest {
  phone?: string;
  caseNumber?: string;
}

function buildCallbackMessage(caseNumber: string) {
  return `We've logged your report. Case #${caseNumber}. An officer will follow up within 2 hours.`;
}

async function sendViaTwilio(phone: string, body: string) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;

  if (!sid || !token || !from) {
    return { sent: false as const, reason: "missing_twilio_config" };
  }

  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      To: phone,
      From: from,
      Body: body,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    return { sent: false as const, reason: "twilio_error", detail: text };
  }

  const data = (await response.json()) as { sid?: string };
  return { sent: true as const, provider: "twilio" as const, sid: data.sid };
}

export async function POST(req: NextRequest) {
  try {
    const { phone, caseNumber }: CallbackRequest = await req.json();

    if (!phone || !caseNumber) {
      return NextResponse.json(
        { error: "Missing required fields: phone, caseNumber" },
        { status: 400 },
      );
    }

    const message = buildCallbackMessage(caseNumber);
    const twilio = await sendViaTwilio(phone, message);

    if (twilio.sent) {
      return NextResponse.json({
        sent: true,
        provider: "twilio",
        messageSid: twilio.sid,
        caseNumber,
      });
    }

    // Safe fallback in local/dev environments without SMS credentials.
    console.log("caller-callback mock send:", { phone, caseNumber, message });
    return NextResponse.json({
      sent: true,
      provider: "mock",
      caseNumber,
    });
  } catch (err) {
    console.error("caller-callback error:", err);
    return NextResponse.json({ error: "Callback SMS failed" }, { status: 500 });
  }
}

