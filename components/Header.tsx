"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LoginModal } from "@/components/LoginModal";
import { NotificationBell } from "@/components/NotificationBell";
import Image from "next/image";
import { useAuth } from "@/context/AuthContext";

export function Header() {
  const { user, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const update = () => setIsDesktop(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const handleLogout = async () => {
    setAccountOpen(false);
    setMobileMenuOpen(false);
    await logout();
  };

  const navLink =
    "text-sm text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 transition-colors";

  return (
    <>
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/logo.svg" alt="PressPlay" width={28} height={28} unoptimized className="w-7 h-7" />
            <span className="font-bold text-xl text-slate-900 dark:text-slate-100">PressPlay</span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-6">
{user ? (
                <>
                  <Link
                    href="/dashboard"
                    className="text-sm text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 transition-colors"
                  >
                    Dashboard
                  </Link>
                  <Link
                    href="/shows"
                    className="text-sm text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 transition-colors"
                  >
                    Shows
                  </Link>
                </>
              ) : (
                <>
                  <Link
                    href="/artists"
                    className="text-sm text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 transition-colors"
                  >
                    Artistas
                  </Link>
                  <Link
                    href="/shows"
                    className="text-sm text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 transition-colors"
                  >
                    Shows
                  </Link>
                  <Link
                    href="/dashboard"
                    className="text-sm text-slate-600 hover:text-slate-900 mx-2 dark:text-slate-400 dark:hover:text-slate-100 transition-colors"
                  >
                    Catálogo
                  </Link>
                </>
              )}
            {user?.role === "admin" && (
              <Link
                href="/admin"
                className="text-sm text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 transition-colors"
              >
                Admin
              </Link>
            )}
            <ThemeToggle />
            {isDesktop && <NotificationBell />}
            {user ? (
              <div className="relative">
                <button
                  onClick={() => setAccountOpen((v) => !v)}
                  aria-expanded={accountOpen}
                  aria-haspopup="menu"
                  className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 transition-colors"
                >
                  <span className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-950 text-primary-700 dark:text-primary-300 font-bold flex items-center justify-center">
                    {user.name?.[0]?.toUpperCase() || "?"}
                  </span>
                  <span className="hidden lg:inline">{user.name} ({user.role})</span>
                </button>
                {accountOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 mt-2 w-48 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg py-2 z-50"
                  >
                    <Link
                      href="/profile"
                      role="menuitem"
                      onClick={() => setAccountOpen(false)}
                      className="block px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      Mi Perfil
                    </Link>
                    <Link
                      href="/account"
                      role="menuitem"
                      onClick={() => setAccountOpen(false)}
                      className="block px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      Mi Cuenta
                    </Link>
                    <Link
                      href="/subscriptions"
                      role="menuitem"
                      onClick={() => setAccountOpen(false)}
                      className="block px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      Mis suscripciones
                    </Link>
                    <Link
                      href="/notifications"
                      role="menuitem"
                      onClick={() => setAccountOpen(false)}
                      className="block px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      Notificaciones
                    </Link>
                    <button
                      role="menuitem"
                      onClick={handleLogout}
                      className="w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      Cerrar sesión
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={() => setLoginModalOpen(true)}
                className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
              >
                Iniciar Sesión
              </button>
            )}
          </nav>

          {/* Mobile Menu Button */}
          <div className="flex items-center gap-1 md:hidden">
            {!isDesktop && <NotificationBell />}
            <button
              className="p-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Abrir menú"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {mobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <nav className="px-4 py-4 space-y-3">
            {user ? (
              <>
                <Link
                  href="/dashboard"
                  className="block text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Dashboard
                </Link>
                <Link
                  href="/shows"
                  className="block text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Shows
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/artists"
                  className="block text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Artistas
                </Link>
                <Link
                  href="/shows"
                  className="block text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Shows
                </Link>
                <Link
                  href="/dashboard"
                  className="block text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Catálogo
                </Link>
              </>
            )}
            {user?.role === "admin" && (
              <Link
                href="/admin"
                className="block text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                onClick={() => setMobileMenuOpen(false)}
              >
                Admin
              </Link>
            )}
            <ThemeToggle />
            {user ? (
              <div className="flex flex-col gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <span className="text-sm text-slate-600 dark:text-slate-400">
                  {user.name} ({user.role})
                </span>
                <Link
                  href="/profile"
                  className="block text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Mi Perfil
                </Link>
                <Link
                  href="/account"
                  className="block text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Mi Cuenta
                </Link>
                <Link
                  href="/subscriptions"
                  className="block text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Mis suscripciones
                </Link>
                <Link
                  href="/notifications"
                  className="block text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Notificaciones
                </Link>
                <button
                  onClick={handleLogout}
                  className="text-left px-4 py-2 text-sm text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                >
                  Cerrar sesión
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  setLoginModalOpen(true);
                }}
                className="w-full px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
              >
                Iniciar Sesión
              </button>
            )}
          </nav>
        </div>
      )}

      {/* Login Modal */}
      <LoginModal
        isOpen={loginModalOpen}
        onClose={() => setLoginModalOpen(false)}
      />
    </>
  );
}