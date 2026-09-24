import { put, del } from "@vercel/blob";

// Vercel Blob storage helper (replaces Cloudflare R2 — no card required,
// billed inside the existing Vercel account). Needs BLOB_READ_WRITE_TOKEN.

function cleanEnv(v: string | undefined): string {
  return (v ?? "").trim().replace(/^["']|["']$/g, "");
}

function token(): string {
  const t = cleanEnv(process.env.BLOB_READ_WRITE_TOKEN);
  if (!t) throw new Error("BLOB_READ_WRITE_TOKEN no configurado");
  return t;
}

function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

export async function uploadImage(
  file: File,
  prefix: string
): Promise<{ url: string; filename: string }> {
  const filename = `${Date.now()}-${sanitizeFilename(file.name)}`;
  const blob = await put(`${prefix}/${filename}`, file, {
    access: "public",
    token: token(),
  });
  return { url: blob.url, filename };
}

export async function deleteImage(imageUrl: string): Promise<void> {
  // Non-fatal by contract: callers treat storage cleanup as best-effort
  try {
    await del(imageUrl, { token: token() });
  } catch (error) {
    console.error("[blob] delete error (non-fatal):", error);
  }
}
