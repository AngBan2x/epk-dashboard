import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Footer } from "@/components/Footer";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "EPK Dashboard Musical",
    template: "%s | EPK Dashboard Musical",
  },
  description: "Electronic Press Kit para artistas musicales. Comparte tu música, gestiona tu catálogo y conecta con tu audiencia.",
  icons: {
    icon: "/logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={`${inter.className} pb-24`}>
        <Providers>{children}</Providers>
        <Footer />
      </body>
    </html>
  );
}
