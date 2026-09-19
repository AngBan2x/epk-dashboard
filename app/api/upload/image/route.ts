import { NextRequest, NextResponse } from "next/server";
import { validateRequest } from "@/lib/auth";
import { getTrackById, getDbWrite, isTursoConfigured } from "@/lib/db";
import { getTursoClient } from "@/lib/turso";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

function validateSession(req: NextRequest): { userId: string; role: string } | null {
  const session = validateRequest(req);
  if (!session) return null;
  return { userId: session.userId, role: session.role || "artist" };
}

function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function getS3Client(): S3Client {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("R2 credentials not configured");
  }

  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

async function dbQuery(sql: string, params?: unknown[]): Promise<unknown[]> {
  if (isTursoConfigured()) {
    const client = getTursoClient();
    if (!client) throw new Error("Turso client not available");
    const result = await client.execute({ sql, args: (params ?? []) as any[] });
    return result.rows as unknown[];
  }
  const db = getDbWrite();
  const stmt = db.prepare(sql);
  return params ? stmt.all(...params) : stmt.all();
}

async function dbRun(sql: string, params?: unknown[]): Promise<void> {
  if (isTursoConfigured()) {
    const client = getTursoClient();
    if (!client) throw new Error("Turso client not available");
    await client.execute({ sql, args: (params ?? []) as any[] });
    return;
  }
  const db = getDbWrite();
  const stmt = db.prepare(sql);
  stmt.run(...(params ?? []));
}

export async function POST(req: NextRequest) {
  try {
    const session = validateSession(req);
    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const trackId = formData.get("trackId") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No se proporcionó archivo" }, { status: 400 });
    }
    if (!trackId) {
      return NextResponse.json({ error: "trackId requerido" }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Tipo de archivo no válido. Solo se permiten JPG, PNG o WebP" },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "El archivo supera el límite de 5MB" },
        { status: 400 }
      );
    }

    const track = await getTrackById(trackId);
    if (!track) {
      return NextResponse.json({ error: "Track no encontrado" }, { status: 404 });
    }

    // Verify ownership: user must be the artist who owns this track
    const artistRow = await dbQuery(
      "SELECT user_id FROM artists WHERE name = ?",
      [track.artist_name]
    ) as { user_id: string }[];
    const ownsTrack = artistRow.length > 0 && artistRow[0].user_id === session.userId;

    if (!ownsTrack && session.role !== "admin") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const artistId = artistRow.length > 0 ? artistRow[0].user_id : session.userId;
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const timestamp = Date.now();
    const sanitizedName = sanitizeFilename(file.name);
    const key = `${artistId}/${trackId}/${timestamp}-${sanitizedName}`;

    const bucket = process.env.R2_BUCKET_NAME;
    if (!bucket) {
      return NextResponse.json({ error: "R2 bucket not configured" }, { status: 500 });
    }

    const s3 = getS3Client();
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: file.type,
        ACL: "public-read",
      })
    );

    const publicUrl = process.env.R2_PUBLIC_URL || `https://${bucket}.${process.env.R2_ACCOUNT_ID}.r2.dev`;
    const imageUrl = `${publicUrl}/${key}`;

    // Append to gallery_images in the tracks table
    const existing = await dbQuery(
      "SELECT gallery_images FROM tracks WHERE id = ?",
      [trackId]
    ) as { gallery_images: string | null }[];

    let galleryImages: string[] = [];
    if (existing.length > 0 && existing[0].gallery_images) {
      try {
        const parsed = JSON.parse(existing[0].gallery_images);
        if (Array.isArray(parsed)) {
          galleryImages = parsed.filter((item: unknown) => typeof item === "string");
        }
      } catch {
        galleryImages = [];
      }
    }

    galleryImages.push(imageUrl);

    await dbRun(
      "UPDATE tracks SET gallery_images = ? WHERE id = ?",
      [JSON.stringify(galleryImages), trackId]
    );

    return NextResponse.json({ url: imageUrl }, { status: 201 });
  } catch (error) {
    console.error("[API/upload/image] Error:", error);
    return NextResponse.json(
      { error: "Error al subir la imagen" },
      { status: 500 }
    );
  }
}
