import Link from "next/link";

export function Header() {
  return (
    <header className="border-b border-dark-200 dark:border-dark-700 bg-white/80 dark:bg-dark-800/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
        <Link href="/dashboard" className="flex items-center gap-2">
          <span className="text-2xl">🎵</span>
          <span className="font-bold text-xl">EPK Dashboard</span>
        </Link>
        <nav className="flex items-center gap-4">
          <Link href="/dashboard" className="text-sm text-dark-600 hover:text-dark-900 dark:text-dark-400 dark:hover:text-dark-100">
            Dashboard
          </Link>
        </nav>
      </div>
    </header>
  );
}
