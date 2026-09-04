'use client';

import { motion } from 'framer-motion';

const features = [
  {
    title: 'Descubre Artistas',
    description: 'Explora un catálogo de músicos independientes, escucha sus pistas y sigue sus carreras.',
    icon: (
      <svg className="w-12 h-12 text-amber-500 dark:text-amber-400" fill="currentColor" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" />
      </svg>
    ),
  },
  {
    title: 'Sigue tus favoritos',
    description: 'Crea listas de reproducción, recibe notificaciones de lanzamientos y eventos cercanos.',
    icon: (
      <svg className="w-12 h-12 text-amber-500 dark:text-amber-400" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L6.82 14.14L2 9.27L8.91 8.26L12 2Z" />
      </svg>
    ),
  },
  {
    title: 'Próximos Shows',
    description: 'Consulta el calendario de conciertos y eventos en vivo cerca de ti.',
    icon: (
      <svg className="w-12 h-12 text-amber-500 dark:text-amber-400" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L6.82 14.14L2 9.27L8.91 8.26L12 2Z" />
      </svg>
    ),
  },
];

export default function LandingFeatures() {
  return (
    <section className="py-16 bg-white dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl font-bold text-center text-gray-800 dark:text-gray-100 mb-12">Cómo funciona PressPlay</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {features.map((feature) => (
            <motion.div
              key={feature.title}
              className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-6 hover:shadow-lg transition-shadow"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.6 }}
            >
              <div className="flex items-center justify-center mb-4">
                {feature.icon}
              </div>
              <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-2">
                {feature.title}
              </h3>
              <p className="text-gray-600 dark:text-gray-300">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}