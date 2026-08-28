import Link from "next/link";

export default function TrackNotFound() {
  return (
    <main className="min-h-screen p-8 flex flex-col items-center justify-center">
      <h1 className="text-4xl font-bold mb-4">Track no encontrado</h1>
      <p className="text-gray-600 mb-8">El track que buscas no existe.</p>
      <Link
        href="/dashboard"
        className="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition"
      >
        Volver al Dashboard
      </Link>
    </main>
  );
}
