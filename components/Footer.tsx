export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <img src="/logo.svg" alt="PressPlay" className="w-6 h-6" />
              <span className="font-bold text-slate-900 dark:text-slate-100">PressPlay</span>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Donde la música se presenta. Comparte tu música, conecta con tu audiencia.
            </p>
          </div>

          {/* Links */}
          <div>
            <h4 className="font-semibold text-sm text-slate-900 dark:text-slate-100 mb-3">Plataforma</h4>
            <ul className="space-y-2 text-sm text-slate-500 dark:text-slate-400">
              <li>
                <a href="/dashboard" className="hover:text-emerald-500 transition-colors">
                  Catálogo de Tracks
                </a>
              </li>
              <li>
                <a href="/upload" className="hover:text-emerald-500 transition-colors">
                  Subir Música
                </a>
              </li>
              <li>
                <a href="/admin" className="hover:text-emerald-500 transition-colors">
                  Panel Admin
                </a>
              </li>
            </ul>
          </div>

          {/* Social / Redes */}
          <div>
            <h4 className="font-semibold text-sm text-slate-900 dark:text-slate-100 mb-3">Síguenos</h4>
            <div className="flex items-center gap-3">
              <a
                href="/"
                className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-emerald-500 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                aria-label="PressPlay"
              >
                <img src="/logo.svg" alt="PressPlay" className="w-5 h-5" />
              </a>
              <a
                href="https://music.apple.com"
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-emerald-500 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                aria-label="Apple Music"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M23.994 6.124a9.23 9.23 0 00-.24-2.19c-.317-1.31-1.062-2.31-2.18-3.043A5.022 5.022 0 0019.2.275a9.687 9.687 0 00-1.065-.173 20.08 20.08 0 00-1.754-.05c-.04 0-.078-.004-.118-.004H7.732c-.04 0-.078.004-.118.004a20.08 20.08 0 00-1.754.05 9.687 9.687 0 00-1.065.173 5.022 5.022 0 00-2.374.617C1.243 1.67.498 2.67.18 3.98a9.23 9.23 0 00-.24 2.19c-.004.04-.004.078-.004.118v13.52c0 .04 0 .078.004.118a9.23 9.23 0 00.24 2.19c.318 1.31 1.062 2.31 2.18 3.043a5.022 5.022 0 002.374.617c.354.058.71.1 1.065.173a20.08 20.08 0 001.754.05c.04 0 .078.004.118.004h8.416c.04 0 .078-.004.118-.004a20.08 20.08 0 001.754-.05c.354-.058.71-.1 1.065-.173a5.022 5.022 0 002.374-.617c1.118-.733 1.863-1.733 2.18-3.043a9.23 9.23 0 00.24-2.19c.004-.04.004-.078.004-.118V6.242c0-.04 0-.078-.004-.118zM17.95 12.45c0 2.87-2.25 5.2-5.03 5.2-2.78 0-5.03-2.33-5.03-5.2s2.25-5.2 5.03-5.2c2.78 0 5.03 2.33 5.03 5.2z" />
                </svg>
              </a>
              <a
                href="https://instagram.com"
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-emerald-500 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                aria-label="Instagram"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
                </svg>
              </a>
            </div>
          </div>
        </div>

        {/* Bottom */}
        <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400 dark:text-slate-500">
          <p>&copy; {year} PressPlay. Todos los derechos reservados.</p>
          <p className="flex items-center gap-1">
            Hecho con <span className="text-red-500">&#9829;</span> para artistas musicales
          </p>
        </div>
      </div>
    </footer>
  );
}
