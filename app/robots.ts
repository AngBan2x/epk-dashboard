import type { MetadataRoute } from "next";

const BASE_URL = "https://epk-dashboard.vercel.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/account", "/profile", "/notifications", "/subscriptions", "/releases/new", "/api/"],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  };
}
