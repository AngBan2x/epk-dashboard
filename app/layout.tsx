import './globals.css';
import { Inter } from 'next/font/google';
import type { Metadata } from 'next';
import { ClientLayout } from '@/components/ClientLayout';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: {
    default: 'PressPlay',
    template: '%s | PressPlay',
  },
  description: 'Donde la música se presenta. Electronic Press Kit para artistas musicales.',
  icons: {
    icon: '/logo.svg',
  },
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
      </head>
      <body className={inter.className}>
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}