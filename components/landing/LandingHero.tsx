'use client';

import { motion } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';

export default function LandingHero() {
  const { user } = useAuth();
  const isGuest = !user;

  const CTALabel = isGuest ? 'Explorar Catálogo' : 'Ir al Dashboard';
  const CTAPath = isGuest ? '/catalog' : '/dashboard';

  return (
    <section className="relative h-screen w-full flex flex-col items-center justify-center overflow-hidden">
      {/* Background & Overlay */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url('https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=1920&q=80')` }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-black/70" />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center text-center px-6 max-w-4xl mx-auto">
        {/* Logo */}
        <motion.img
          src="/logo.svg"
          alt="PressPlay"
          className="w-16 h-16 md:w-20 md:h-20 mb-6 object-contain"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />

        {/* Slogan */}
        <motion.h1
          className="text-4xl md:text-5xl lg:text-6xl font-black text-white leading-tight mb-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          Donde la música se presenta
        </motion.h1>

        {/* Description */}
        <motion.p
          className="max-w-2xl text-base md:text-lg text-white/80 mb-8 leading-relaxed"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
        >
          PressPlay es la plataforma EPK para artistas independientes.
          Crea tu press kit profesional, conecta con tu audiencia y gestiona tus shows.
        </motion.p>

        {/* CTAs */}
        <motion.div
          className="flex flex-col sm:flex-row gap-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
        >
          <Link
            href={CTAPath}
            className="bg-amber-500 hover:bg-amber-600 text-black font-bold rounded-full px-8 py-3.5 transition-colors text-base"
          >
            {CTALabel}
          </Link>
          <a
            href="#como-funciona"
            className="border-2 border-white/60 hover:border-white text-white font-semibold rounded-full px-8 py-3.5 transition-colors text-base"
          >
            Cómo Funciona PressPlay
          </a>
        </motion.div>
      </div>

      {/* Bottom gradient fade */}
      <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-white dark:from-slate-900 to-transparent" />
    </section>
  );
}
