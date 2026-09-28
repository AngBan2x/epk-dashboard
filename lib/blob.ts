import { put, del } from "@vercel/blob";

// Vercel Blob storage helper (replaces Cloudflare R2 — no card required,
// billed inside the existing Vercel account).
//
// Auth: OIDC. The store is connected to the Vercel project, so the platform
// injects a short-lived OIDC token per request and BLOB_STORE_ID selects the
// store. No long-lived secret is needed and none should be set here: an
// explicit `token` option would take precedence over OIDC in the SDK and
// force a static credential back into use.

function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

export async function uploadImage(
  file: File,
  prefix: string,
  contentType?: string
): Promise<{ url: string; filename: string }> {
  const filename = `${Date.now()}-${sanitizeFilename(file.name)}`;
  const blob = await put(`${prefix}/${filename}`, file, {
    access: "public",
    contentType: contentType || file.type || undefined,
  });
  return { url: blob.url, filename };
}

export async function deleteImage(imageUrl: string): Promise<void> {
  // Non-fatal by contract: callers treat storage cleanup as best-effort
  try {
    await del(imageUrl);
  } catch (error) {
    console.error("[blob] delete error (non-fatal):", error);
  }
}
