'use client';

import { usePathname } from 'next/navigation';
import { Header } from '@/components/Header';
import { Providers } from '@/components/Providers';
import { Footer } from '@/components/Footer';

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const showHeader = pathname !== '/';

  return (
    <Providers>
      {showHeader && <Header />}
      {children}
      <Footer />
    </Providers>
  );
}
