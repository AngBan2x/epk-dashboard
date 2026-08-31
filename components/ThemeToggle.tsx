"use client";

import { useEffect, useState } from "react";

// Toggle Dark/Light mode sin dependencias externas
// Usa la clase 'dark' en el elemento <html> (Tailwind darkMode: 'class')
export function ThemeToggle() {
  const [isDark, setIsDark] = useState(true);
  const [mounted, setMounted] = useState(false);

  // Evita Hydration Mismatch: el estado real se lee solo en cliente
  useEffect(() => {
    setMounted(true);
    const savedTheme = localStorage.getItem("epk-theme");
    if (savedTheme === "light") {
      setIsDark(false);
      document.documentElement.classList.remove("dark");
    } else {
      // Por defecto: dark
      setIsDark(true);
      document.documentElement.classList.add("dark");
    }
  }, []);

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    if (next) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("epk-theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("epk-theme", "light");
    }
  };

  // No renderiza nada hasta que esté montado (evita SSR mismatch)
  if (!mounted) {
    return (
      <div
        className="w-10 h-10 rounded-xl bg-dark-800/50 border border-dark-700/50 animate-pulse"
        aria-hidden="true"
      />
    );
  }

  return (
    <button
      onClick={toggleTheme}
      className="w-10 h-10 rounded-xl border transition-all duration-200 flex items-center justify-center text-lg
        bg-slate-100 dark:bg-dark-800 border-slate-300 dark:border-dark-600
        hover:bg-slate-200 dark:hover:bg-dark-700
        hover:scale-105 active:scale-95
        focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
      aria-label={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      title={isDark ? "Modo Claro" : "Modo Oscuro"}
    >
      {isDark ? "☀️" : "🌙"}
    </button>
  );
}
