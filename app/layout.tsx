import './globals.css';
import { Inter } from 'next/font/google';
import type { Metadata } from 'next';
import { ClientLayout } from '@/components/ClientLayout';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  metadataBase: new URL('https://epk-dashboard.vercel.app'),
  title: {
    default: 'PressPlay',
    template: '%s | PressPlay',
  },
  description: 'Donde la música se presenta. Electronic Press Kit para artistas musicales.',
  applicationName: 'PressPlay',
  keywords: ['press kit', 'EPK', 'artistas musicales', 'promotores', 'shows', 'catalogo musical'],
  authors: [{ name: 'PressPlay' }],
  openGraph: {
    type: 'website',
    siteName: 'PressPlay',
    title: 'PressPlay — Donde la música se presenta',
    description: 'Electronic Press Kit para artistas musicales: bios, releases, shows y rider técnico.',
    url: 'https://epk-dashboard.vercel.app',
    locale: 'es_VE',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'PressPlay — Donde la música se presenta',
    description: 'Electronic Press Kit para artistas musicales: bios, releases, shows y rider técnico.',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
  icons: {
    icon: '/logo.svg',
    apple: '/logo.svg',
  },
  manifest: '/manifest.webmanifest',
};

// Script para sincronizar dark class antes del paint (evita FOUC)
const themeScript = `
  (function() {
    try {
      var theme = localStorage.getItem('epk-theme');
      if (theme === 'light') {
        document.documentElement.classList.remove('dark');
      } else {
        document.documentElement.classList.add('dark');
      }
    } catch(e) {}
  })();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <link rel="preconnect" href="https://is1-ssl.mzstatic.com" />
        <link rel="preconnect" href="https://img.youtube.com" />
        <link rel="dns-prefetch" href="https://i.ytimg.com" />
      </head>
      <body className={inter.className}>
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}