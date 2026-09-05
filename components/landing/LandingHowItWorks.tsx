'use client';

import { motion } from 'framer-motion';

const steps = [
  {
    number: '1',
    title: 'Crea tu Perfil',
    description: 'Regístrate como artista o suscriptor en segundos. Personaliza tu perfil con foto, bio y redes sociales.',
  },
  {
    number: '2',
    title: 'Publica tu Música',
    description: 'Sube releases, tracks y multimedia. Gestiona tu discografía y conecta con plataformas de streaming.',
  },
  {
    number: '3',
    title: 'Conecta con tu Audiencia',
    description: 'Los fans descubren tu música, siguen tus lanzamientos y asisten a tus shows en vivo.',
  },
];

export default function LandingHowItWorks() {
  return (
    <section id="como-funciona" className="py-20 bg-slate-50 dark:bg-slate-800">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          className="text-center mb-14"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-4">
            Cómo Funciona
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-lg max-w-2xl mx-auto">
            Tres pasos sencillos para empezar
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12">
          {steps.map((step, idx) => (
            <motion.div
              key={step.number}
              className="relative flex flex-col items-center text-center"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: idx * 0.15 }}
            >
              {/* Connector line (desktop only, not on last item) */}
              {idx < steps.length - 1 && (
                <div className="hidden md:block absolute top-7 left-[calc(50%+40px)] w-[calc(100%-80px)] h-0.5 bg-slate-200 dark:bg-slate-600" />
              )}

              {/* Number circle */}
              <div className="relative z-10 w-14 h-14 bg-emerald-500 text-white rounded-full flex items-center justify-center text-xl font-bold mb-5 shadow-lg shadow-emerald-500/25">
                {step.number}
              </div>

              <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
                {step.title}
              </h3>
              <p className="text-slate-500 dark:text-slate-400 leading-relaxed max-w-xs">
                {step.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
