import { NextRequest, NextResponse } from "next/server";
import { getAllTrackSubmissions, getTrackSubmissionsByStatus } from "@/lib/db";

export const dynamic = "force-dynamic";

function validateAdminSession(req: NextRequest): { userId: string; role: string } | null {
  const sessionCookie = req.cookies.get("auth_session");
  if (!sessionCookie) return null;
  try {
    const decoded = atob(sessionCookie.value);
    const session = JSON.parse(decoded) as { userId: string; role?: string };
    if (session.role !== "admin") return null;
    return { userId: session.userId, role: session.role };
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  try {
    const admin = validateAdminSession(req);
    if (!admin) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");

    let submissions;
    if (status && ["pending", "approved", "rejected", "revision"].includes(status)) {
      submissions = await getTrackSubmissionsByStatus(status as any);
    } else {
      submissions = await getAllTrackSubmissions();
    }

    const stats = {
      pending: submissions.filter((s: any) => s.status === "pending").length,
      approved: submissions.filter((s: any) => s.status === "approved").length,
      rejected: submissions.filter((s: any) => s.status === "rejected").length,
      revision: submissions.filter((s: any) => s.status === "revision").length,
      total: submissions.length,
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
