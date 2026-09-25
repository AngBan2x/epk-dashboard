"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import Image from "next/image";
import { Button } from "@/components/ui/Button";
import { safeString } from "@/lib/null-safe";

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState<"artist" | "subscriber">("artist");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden");
      return;
    }

    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres");
      return;
    }

    setLoading(true);

    try {
      await register(name, email, password, role);
      router.push(role === "artist" ? "/dashboard" : "/artists");
      router.refresh();
    } catch (err) {
      setError(safeString(err instanceof Error ? err.message : "Error al registrar"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-xl p-8 border border-slate-200 dark:border-slate-700">
        <div className="text-center mb-8">
          <Image src="/logo.svg" alt="PressPlay" width={48} height={48} unoptimized className="w-12 h-12 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Crear Cuenta</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Únete a PressPlay</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <fieldset>
            <legend className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Tipo de cuenta
            </legend>
            <div className="grid grid-cols-2 gap-3">
              <label
                htmlFor="role-artist"
                className={`cursor-pointer rounded-lg border p-3 text-sm transition ${
                  role === "artist"
                    ? "border-primary-600 bg-primary-50 dark:bg-primary-950/40 ring-1 ring-primary-600"
                    : "border-slate-300 dark:border-slate-600 hover:border-slate-400"
                }`}
              >
                <input
                  id="role-artist"
                  type="radio"
                  name="role"
                  value="artist"
                  checked={role === "artist"}
                  onChange={() => setRole("artist")}
                  className="sr-only"
                />
                <span className="block font-semibold text-slate-900 dark:text-slate-100">Artista</span>
                <span className="block text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Publica tu música, shows y dossier de prensa
                </span>
              </label>
              <label
                htmlFor="role-subscriber"
                className={`cursor-pointer rounded-lg border p-3 text-sm transition ${
                  role === "subscriber"
                    ? "border-primary-600 bg-primary-50 dark:bg-primary-950/40 ring-1 ring-primary-600"
                    : "border-slate-300 dark:border-slate-600 hover:border-slate-400"
                }`}
              >
                <input
                  id="role-subscriber"
                  type="radio"
                  name="role"
                  value="subscriber"
                  checked={role === "subscriber"}
                  onChange={() => setRole("subscriber")}
                  className="sr-only"
                />
                <span className="block font-semibold text-slate-900 dark:text-slate-100">Suscriptor</span>
                <span className="block text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Sigue a tus artistas favoritos y recibe avisos
                </span>
              </label>
            </div>
          </fieldset>

          <div>
            <label htmlFor="name" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Nombre
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={2}
              className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              placeholder="Tu nombre"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              placeholder="tu@email.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              placeholder="Mínimo 8 caracteres"
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Confirmar contraseña
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              placeholder="Repite tu contraseña"
            />
          </div>

          <Button type="submit" className="w-full py-3" disabled={loading}>
            {loading ? "Creando cuenta..." : "Crear Cuenta"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
          ¿Ya tienes cuenta?{" "}
          <Link href="/login" className="text-emerald-600 dark:text-emerald-400 hover:underline font-medium">
            Inicia sesión
          </Link>
        </p>
      </div>
    </div>
  );
}