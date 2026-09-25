import { NextRequest, NextResponse } from "next/server";
import { validateRequest } from "@/lib/auth";
import { getEmailConfig, getEmailStats, getFromAddress } from "@/lib/email";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await validateRequest(req);
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "No autorizado - Se requiere rol de admin" }, { status: 403 });
    }

    const config = getEmailConfig();
    const from = getFromAddress();
    const angleMatch = from.match(/<([^>]+)>/);
    const fromAddress = angleMatch ? angleMatch[1] : from;
    const fromDomain = fromAddress.includes("@") ? fromAddress.split("@").pop() : null;

    return NextResponse.json({
      configured: config.configured,
      missing: config.missing,
      from,
      from_domain: fromDomain,
      stats: getEmailStats(),
    });
  } catch (error) {
    console.error("GET admin email-status error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
