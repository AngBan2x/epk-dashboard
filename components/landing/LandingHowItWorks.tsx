'use client';

import { motion } from 'framer-motion';

const steps = [
  {
    title: 'Registro y Perfil',
    description: 'Crea tu cuenta como artista, admin o suscriptor y personaliza tu perfil.',
    icon: (
      <svg className="w-12 h-12 text-amber-500 dark:text-amber-400" fill="currentColor" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" />
      </svg>
    ),
  },
  {
    title: 'Publica tu Música',
    description: 'Sube tus pistas, gestiona lanzamientos y conecta con la comunidad.',
    icon: (
      <svg className="w-12 h-12 text-amber-500 dark:text-amber-400" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L6.82 14.14L2 9.27L8.91 8.26L12 2Z" />
      </svg>
    ),
  },
  {
    title: 'Descubre y Disfruta',
    description: 'Explora nuevos talentos, sigue a tus favoritos y asiste a shows en vivo.',
    icon: (
      <svg className="w-12 h-12 text-amber-500 dark:text-amber-400" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L6.82 14.14L2 9.27L8.91 8.26L12 2Z" />
      </svg>
    ),
  },
];

export default function LandingHowItWorks() {
  return (
    <section className="py-16 bg-gray-50 dark:bg-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl font-bold text-center text-gray-800 dark:text-gray-100 mb-12">Cómo funciona</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
          {steps.map((step, idx) => (
            <motion.div
              key={idx}
              className="bg-white dark:bg-gray-700 rounded-xl shadow p-6 flex flex-col items-center text-center transition-all hover:transform hover:scale-105"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.8 }}
            >
              <svg
                className="w-12 h-12 text-amber-500 mb-4"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                {step.icon}
              </svg>
              <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-2">
                {step.title}
              </h3>
              <p className="text-gray-600 dark:text-gray-300">
                {step.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}