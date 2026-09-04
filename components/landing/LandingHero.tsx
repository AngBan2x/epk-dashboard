'use client';

import { motion } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function LandingHero() {
  const { user } = useAuth();
  const router = useRouter();
  const isGuest = !user;

  const CTALabel = isGuest ? 'Explorar Catálogo' : 'Ir al Dashboard';
  const CTAPath = isGuest ? '/catalog' : '/dashboard';

  return (
    <motion.div
      className="relative h-screen w-full flex flex-col md:flex-row items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      {/* Background & Overlay */}
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url('https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=1920&q=80')` }} />
      <div className="absolute inset-0 bg-black/50 dark:bg-gray-900/80" />

      {/* Content */}
      <div className="flex flex-col items-center justify-center h-full w-full px-4 md:px-8 text-center relative z-10">
        {/* Logo */}
        <motion.img
          src="/logo.svg"
          alt="PressPlay"
          className="w-1/3 md:w-1/2 xl:w-3/5 object-contain animate-fade-in-scale"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />

        {/* Slogan */}
        <motion.h1 className="text-4xl md:text-6xl lg:text-8xl font-black text-white/90 mb-4 animate-fade-in">
          Donde la música se presenta
        </motion.h1>

        {/* Description */}
        <motion.p className="max-w-2xl text-lg text-white/90 animate-fade-in mb-8">
          PressPlay es la plataforma donde los artistas independientes presentan su música al mundo. Descubre nuevos talentos, sigue a tus artistas favoritos y mantente al día con sus próximos shows.
        </motion.p>

        {/* CTA Button */}
        <Link href={CTAPath}>
          <motion.span
            className="mt-8 bg-amber-500 hover:bg-amber-600 text-black font-bold rounded-full px-8 py-4 transition-colors inline-block cursor-pointer"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            {CTALabel}
          </motion.span>
        </Link>

        {/* Scroll indicator */}
        <motion.div
          className="mt-12"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: -10 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.5, ease: 'easeInOut' }}
        >
          <svg
            className="w-6 h-6 text-white animate-bounce"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L6.82 14.14L2 9.27L8.91 8.26L12 2Z" />
          </svg>
        </motion.div>
      </div>
    </motion.div>
  );
}