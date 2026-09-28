import { NextRequest, NextResponse } from "next/server";
import { getAllTrackSubmissions, getAllArtists } from "@/lib/db";
import { validateRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

async function validateAdminSession(req: NextRequest) {
  const session = await validateRequest(req);
  if (!session || session.role !== "admin") return null;
  return { userId: session.userId, role: session.role };
}

const statusLabels: Record<string, string> = {
  pending: "Pendiente",
  approved: "Aprobado",
  rejected: "Rechazado",
  revision: "Revisión",
};

function addSpanishStatusLabel(submission: any) {
  return {
    ...submission,
    status_label: statusLabels[submission.status] || submission.status,
  };
}

export async function GET(req: NextRequest) {
  try {
    const admin = await validateAdminSession(req);
    if (!admin) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const search = searchParams.get("search");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);

    const allSubmissions = await getAllTrackSubmissions();

    const ownerIds = new Set(
      (await getAllArtists())
        .filter((a) => Boolean(a.user_id))
        .map((a) => (a.name || "").toLowerCase())
    );

    // Filter by status
    let filtered = allSubmissions;
    if (status && ["pending", "approved", "rejected", "revision"].includes(status)) {
      filtered = filtered.filter((s) => s.status === status);
    }

    // Search by title or artist name
    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter((s) => {
        const trackData = JSON.parse(s.track_data);
        return (
          trackData.title?.toLowerCase().includes(searchLower) ||
          trackData.artist_name?.toLowerCase().includes(searchLower)
        );
      });
    }

    // Stats computed on ALL submissions (not filtered)
    const stats = {
      pending: allSubmissions.filter((s) => s.status === "pending").length,
      approved: allSubmissions.filter((s) => s.status === "approved").length,
      rejected: allSubmissions.filter((s) => s.status === "rejected").length,
      revision: allSubmissions.filter((s) => s.status === "revision").length,
      total: allSubmissions.length,
    };

    // Pagination
    const total = filtered.length;
    const totalPages = Math.ceil(total / limit);
    const start = (page - 1) * limit;
    const paginated = filtered.slice(start, start + limit);

    const submissionsWithLabels = paginated.map((s) => {
      const withLabel = addSpanishStatusLabel(s);
      let artistName = "";
      try {
        artistName = String(JSON.parse(s.track_data)?.artist_name ?? "");
      } catch {
        artistName = "";
      }
      return {
        ...withLabel,
        artist_has_owner: artistName.length > 0 && ownerIds.has(artistName),
      };
    });

    const ownerless = allSubmissions.filter((s) => {
      let name = "";
      try {
        name = String(JSON.parse(s.track_data)?.artist_name ?? "");
      } catch {
        name = "";
      }
      return name.length > 0 && !ownerIds.has(name);
    }).length;

    return NextResponse.json({
      submissions: submissionsWithLabels,
      stats,
      artistless_count: ownerless,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    }, {
      headers: {
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
      },
    });
  } catch (error) {
    console.error("GET admin approvals error:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
