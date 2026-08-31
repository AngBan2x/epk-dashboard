import { UploadTrackForm } from "@/components/UploadTrackForm";

export default function UploadPage() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-100 mb-4">Subir Tu Música</h1>
          <p className="text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
            Completa el formulario con los datos de tu track. Usa el autocompletado de iTunes
            para rellenar automáticamente la información de tu canción.
          </p>
        </div>

        <UploadTrackForm />
      </div>
    </div>
  );
}