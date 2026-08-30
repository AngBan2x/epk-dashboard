"use client";

import { motion, type Variants } from "framer-motion";
import { ReactNode } from "react";

// Variantes de animación para entrada de diapositivas (Pitch Deck style)
const slideVariants: Variants = {
  hidden: { opacity: 0, y: 32 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.08,
      duration: 0.45,
      ease: [0.22, 1, 0.36, 1] as const,
    },
  }),
};

const fadeInVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.5, ease: "easeOut" },
  },
};

// Wrapper de página para transición de entrada
export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={fadeInVariants}
    >
      {children}
    </motion.div>
  );
}

// Elemento que aparece al hacer scroll o cargarse con stagger delay
export function SlideIn({ children, index = 0, className = "" }: { children: ReactNode; index?: number; className?: string }) {
  return (
    <motion.div
      custom={index}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-40px" }}
      variants={slideVariants}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// Tarjeta EPK con efecto Lift en hover
export function LiftCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      whileHover={{ y: -4, scale: 1.015, boxShadow: "0 20px 40px rgba(0,0,0,0.18)" }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// Encabezado de sección Pitch Deck con animación dramática
export function PitchHeading({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 20 }}
      whileInView={{ opacity: 1, scale: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
