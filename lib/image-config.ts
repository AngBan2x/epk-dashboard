const OPTIMIZABLE_HOSTS = [
  "i.scdn.co",
  "mzstatic.com",
  "img.youtube.com",
  "ytimg.com",
  "images.unsplash.com",
  "public.blob.vercel-storage.com",
  "r2.dev",
  "r2.cloudflarestorage.com",
];

export function isOptimizableImage(src: string | null | undefined): boolean {
  if (!src) return false;
  if (src.startsWith("/")) return true;
  if (src.startsWith("blob:") || src.startsWith("data:")) return false;
  if (!src.startsWith("http://") && !src.startsWith("https://")) return false;

  try {
    const host = new URL(src).hostname.toLowerCase();
    return OPTIMIZABLE_HOSTS.some(
      (allowed) => host === allowed || host.endsWith(`.${allowed}`)
    );
  } catch {
    return false;
  }
}

export function imageOptimizationProps(src: string | null | undefined): {
  unoptimized?: boolean;
} {
  return isOptimizableImage(src) ? {} : { unoptimized: true };
}
