"use client";

import { useState } from "react";

interface DossierEditorProps {
  artistName: string;
  onSave?: (data: { biography: string; contactEmail: string }) => void;
}

export function DossierEditor({ artistName, onSave }: DossierEditorProps) {
  const [biography, setBiography] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [expanded, setExpanded] = useState(false);

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="text-xs text-primary-500 hover:text-primary-600 underline"
      >
        Personalizar Dossier y Rider
      </button>
    );
  }

  return (
    <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
      <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
        Personalizar Dossier de {artistName}
      </h4>
      <div>
        <label className="text-xs text-slate-500 dark:text-slate-400">Biografía</label>
        <textarea
          value={biography}
          onChange={(e) => setBiography(e.target.value)}
          placeholder="Escribe la biografía del artista..."
          rows={4}
          className="w-full mt-1 px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-slate-100 resize-none"
        />
      </div>
      <div>
        <label className="text-xs text-slate-500 dark:text-slate-400">Email de contacto</label>
        <input
          type="email"
          value={contactEmail}
          onChange={(e) => setContactEmail(e.target.value)}
          placeholder="booking@example.com"
          className="w-full mt-1 px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-slate-100"
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => {
            onSave?.({ biography, contactEmail });
            setExpanded(false);
          }}
          className="px-4 py-2 text-xs font-medium bg-primary-500 text-white rounded-lg hover:bg-primary-600"
        >
          Guardar
        </button>
        <button
          onClick={() => setExpanded(false)}
          className="px-4 py-2 text-xs font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
