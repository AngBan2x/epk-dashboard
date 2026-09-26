import { NextRequest, NextResponse } from "next/server";
import { getAllTrackSubmissions } from "@/lib/db";
import { validateRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

async function validateAdminSession(req: NextRequest) {
  const session = await validateRequest(req);
  if (!session || session.role !== "admin") return null;
  return { userId: session.userId, role: session.role };
}

export async function GET(req: NextRequest) {
  try {
    const admin = await validateAdminSession(req);
    if (!admin) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");

    const allSubmissions = await getAllTrackSubmissions();

    let submissions;
    if (status && ["pending", "approved", "rejected", "revision"].includes(status)) {
      submissions = allSubmissions.filter((s) => s.status === status);
    } else {
      submissions = allSubmissions;
    }

    const stats = {
      pending: allSubmissions.filter((s) => s.status === "pending").length,
      approved: allSubmissions.filter((s) => s.status === "approved").length,
      rejected: allSubmissions.filter((s) => s.status === "rejected").length,
      revision: allSubmissions.filter((s) => s.status === "revision").length,
      total: allSubmissions.length,
    };

    return NextResponse.json({ submissions, stats }, {
      headers: {
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
      },
    });
  } catch (error) {
    console.error("GET admin approvals error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
