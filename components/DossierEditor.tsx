"use client";

import { useState, useEffect, useCallback } from "react";
import { safeString } from "@/lib/null-safe";

interface DossierData {
  biography: string;
  press_text: string;
  genre: string;
  location: string;
  influences: string;
  contact_email: string;
  booking_email: string;
  management: string;
  website: string;
  rider_pa_system: string;
  rider_monitors: string;
  rider_console: string;
  rider_subwoofers: string;
  rider_guitar: string;
  rider_bass: string;
  rider_drums: string;
  rider_keyboards: string;
  rider_lighting: string;
  rider_stage_size: string;
  rider_stage_conditions: string;
  rider_hospitality: string;
  rider_transport: string;
  rider_special_notes: string;
}

const DEFAULTS: DossierData = {
  biography: "",
  press_text: "",
  genre: "",
  location: "",
  influences: "",
  contact_email: "",
  booking_email: "",
  management: "",
  website: "",
  rider_pa_system: "Line Array - Minimo 15,000W RMS",
  rider_monitors: "Minimo 4 mezclas in-ear o wedge",
  rider_console: "Digital - minimo 32 canales",
  rider_subwoofers: "Minimo 4 sub-graves (18 o 21)",
  rider_guitar: "Amplificador Combo 100W o Head + Cabinet",
  rider_bass: "Amplificador Combo 300W minimo",
  rider_drums: "Kit completo + hardware + baquetas",
  rider_keyboards: "Piano digital 88 teclas con sustain",
  rider_lighting: "Iluminacion basica con focus en escenario",
  rider_stage_size: "Minimo 6m x 4m",
  rider_stage_conditions: "Escenario cubierto y seco",
  rider_hospitality: "Agua natural, cafe, frutas frescas, snacks antes del show",
  rider_transport: "Transporte desde hotel al venue incluido",
  rider_special_notes: "",
};

interface DossierEditorProps {
  artistId: string;
  artistName: string;
}

type Tab = "dossier" | "rider";

export function DossierEditor({ artistId, artistName }: DossierEditorProps) {
  const [tab, setTab] = useState<Tab>("dossier");
  const [data, setData] = useState<DossierData>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [expanded, setExpanded] = useState(false);

  const loadDossier = useCallback(async () => {
    try {
      const res = await fetch(`/api/dossiers?artist_id=${artistId}`);
      if (res.ok) {
        const json = await res.json();
        if (json.dossier) {
          setData({
            biography: json.dossier.biography || "",
            press_text: json.dossier.press_text || "",
            genre: json.dossier.genre || "",
            location: json.dossier.location || "",
            influences: json.dossier.influences || "",
            contact_email: json.dossier.contact_email || "",
            booking_email: json.dossier.booking_email || "",
            management: json.dossier.management || "",
            website: json.dossier.website || "",
            rider_pa_system: json.dossier.rider_pa_system || DEFAULTS.rider_pa_system,
            rider_monitors: json.dossier.rider_monitors || DEFAULTS.rider_monitors,
            rider_console: json.dossier.rider_console || DEFAULTS.rider_console,
            rider_subwoofers: json.dossier.rider_subwoofers || DEFAULTS.rider_subwoofers,
            rider_guitar: json.dossier.rider_guitar || DEFAULTS.rider_guitar,
            rider_bass: json.dossier.rider_bass || DEFAULTS.rider_bass,
            rider_drums: json.dossier.rider_drums || DEFAULTS.rider_drums,
            rider_keyboards: json.dossier.rider_keyboards || DEFAULTS.rider_keyboards,
            rider_lighting: json.dossier.rider_lighting || DEFAULTS.rider_lighting,
            rider_stage_size: json.dossier.rider_stage_size || DEFAULTS.rider_stage_size,
            rider_stage_conditions: json.dossier.rider_stage_conditions || DEFAULTS.rider_stage_conditions,
            rider_hospitality: json.dossier.rider_hospitality || DEFAULTS.rider_hospitality,
            rider_transport: json.dossier.rider_transport || DEFAULTS.rider_transport,
            rider_special_notes: json.dossier.rider_special_notes || "",
          });
        }
      }
    } catch (error) {
      console.error("Error loading dossier:", error);
    } finally {
      setLoading(false);
    }
  }, [artistId]);

  useEffect(() => {
    if (expanded) loadDossier();
  }, [expanded, loadDossier]);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/dossiers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artist_id: artistId, ...data }),
      });
      if (res.ok) {
        setMessage({ type: "success", text: "Dossier + Rider guardados exitosamente" });
        setTimeout(() => setMessage(null), 3000);
      } else {
        const err = await res.json();
        setMessage({ type: "error", text: err.error || "Error al guardar" });
      }
    } catch {
      setMessage({ type: "error", text: "Error de conexion" });
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: keyof DossierData, value: string) => {
    setData((prev) => ({ ...prev, [field]: value }));
  };

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="w-full p-4 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 text-left hover:border-primary-400 dark:hover:border-primary-600 transition-colors group"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-lg">
            📄
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
              Dossier / Rider
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Personaliza tu biography, press kit y rider tecnico para {safeString(artistName)}
            </p>
          </div>
        </div>
      </button>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-700">
        <button
          onClick={() => setTab("dossier")}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            tab === "dossier"
              ? "text-primary-600 dark:text-primary-400 border-b-2 border-primary-500 bg-primary-50 dark:bg-primary-950/20"
              : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
          }`}
        >
          📄 Dossier
        </button>
        <button
          onClick={() => setTab("rider")}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            tab === "rider"
              ? "text-primary-600 dark:text-primary-400 border-b-2 border-primary-500 bg-primary-50 dark:bg-primary-950/20"
              : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
          }`}
        >
          🎤 Rider
        </button>
      </div>

      <div className="p-4 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
            <span className="ml-2 text-sm text-slate-500 dark:text-slate-400">Cargando dossier...</span>
          </div>
        ) : (
          <>
            {tab === "dossier" && (
              <DossierTab data={data} updateField={updateField} />
            )}
            {tab === "rider" && (
              <RiderTab data={data} updateField={updateField} />
            )}
          </>
        )}

        {/* Message */}
        {message && (
          <div className={`p-3 rounded-lg text-sm ${
            message.type === "success"
              ? "bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300"
              : "bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300"
          }`}>
            {message.text}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="flex-1 px-4 py-2 text-sm font-medium bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? "Guardando..." : "Guardar"}
          </button>
          <button
            onClick={() => setExpanded(false)}
            className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

function DossierTab({ data, updateField }: { data: DossierData; updateField: (f: keyof DossierData, v: string) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Biografia</label>
        <textarea
          value={data.biography}
          onChange={(e) => updateField("biography", e.target.value)}
          rows={4}
          className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-slate-100 resize-y"
          placeholder="Biografia del artista para el dossier de prensa..."
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Press Text</label>
        <textarea
          value={data.press_text}
          onChange={(e) => updateField("press_text", e.target.value)}
          rows={3}
          className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-slate-100 resize-y"
          placeholder="Texto para articulos de prensa..."
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Genero</label>
          <input
            type="text"
            value={data.genre}
            onChange={(e) => updateField("genre", e.target.value)}
            className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-slate-100"
            placeholder="Rock, Pop, Electronica..."
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Ubicacion</label>
          <input
            type="text"
            value={data.location}
            onChange={(e) => updateField("location", e.target.value)}
            className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-slate-100"
            placeholder="Ciudad, Pais"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Influencias</label>
        <input
          type="text"
          value={data.influences}
          onChange={(e) => updateField("influences", e.target.value)}
          className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-slate-100"
          placeholder="Radiohead, Arctic Monkeys, The Strokes..."
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Email Contacto</label>
          <input
            type="email"
            value={data.contact_email}
            onChange={(e) => updateField("contact_email", e.target.value)}
            className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-slate-100"
            placeholder="contacto@ejemplo.com"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Email Booking</label>
          <input
            type="email"
            value={data.booking_email}
            onChange={(e) => updateField("booking_email", e.target.value)}
            className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-slate-100"
            placeholder="booking@ejemplo.com"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Management</label>
          <input
            type="text"
            value={data.management}
            onChange={(e) => updateField("management", e.target.value)}
            className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-slate-100"
            placeholder="Nombre del management"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Sitio Web</label>
          <input
            type="url"
            value={data.website}
            onChange={(e) => updateField("website", e.target.value)}
            className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-slate-100"
            placeholder="https://..."
          />
        </div>
      </div>
    </div>
  );
}

function RiderTab({ data, updateField }: { data: DossierData; updateField: (f: keyof DossierData, v: string) => void }) {
  return (
    <div className="space-y-6">
      {/* Audio Section */}
      <RiderSection
        icon="🔊"
        title="Audio"
        fields={[
          { key: "rider_pa_system", label: "Sistema PA", placeholder: "Line Array..." },
          { key: "rider_monitors", label: "Monitores", placeholder: "In-ear, wedge..." },
          { key: "rider_console", label: "Consola FOH", placeholder: "Digital..." },
          { key: "rider_subwoofers", label: "Subwoofers", placeholder: "Sub 18..." },
        ]}
        data={data}
        updateField={updateField}
      />

      {/* Backline Section */}
      <RiderSection
        icon="🎸"
        title="Backline"
        fields={[
          { key: "rider_guitar", label: "Guitarra", placeholder: "Amplificador..." },
          { key: "rider_bass", label: "Bajo", placeholder: "Amplificador..." },
          { key: "rider_drums", label: "Bateria", placeholder: "Kit completo..." },
          { key: "rider_keyboards", label: "Teclados", placeholder: "Piano digital..." },
        ]}
        data={data}
        updateField={updateField}
      />

      {/* Stage Section */}
      <RiderSection
        icon="💡"
        title="Escenario"
        fields={[
          { key: "rider_lighting", label: "Iluminacion", placeholder: "Setup basico..." },
          { key: "rider_stage_size", label: "Tamano", placeholder: "Minimo 6x4m..." },
          { key: "rider_stage_conditions", label: "Condiciones", placeholder: "Cubierto y seco..." },
        ]}
        data={data}
        updateField={updateField}
      />

      {/* Hospitality + Transport */}
      <RiderSection
        icon="🍽️"
        title="Hospitality & Transporte"
        fields={[
          { key: "rider_hospitality", label: "Catering", placeholder: "Agua, cafe, frutas..." },
          { key: "rider_transport", label: "Transporte", placeholder: "Hotel al venue..." },
        ]}
        data={data}
        updateField={updateField}
      />

      {/* Special Notes */}
      <div>
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">📝 Notas Especiales</label>
        <textarea
          value={data.rider_special_notes}
          onChange={(e) => updateField("rider_special_notes", e.target.value)}
          rows={3}
          className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-slate-100 resize-y"
          placeholder="Requisitos adicionales, restricciones, notas para el venue..."
        />
      </div>
    </div>
  );
}

function RiderSection({
  icon,
  title,
  fields,
  data,
  updateField,
}: {
  icon: string;
  title: string;
  fields: { key: keyof DossierData; label: string; placeholder: string }[];
  data: DossierData;
  updateField: (f: keyof DossierData, v: string) => void;
}) {
  return (
    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700">
      <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-3 uppercase tracking-wider">
        {icon} {title}
      </h4>
      <div className="space-y-3">
        {fields.map(({ key, label, placeholder }) => (
          <div key={key}>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">{label}</label>
            <input
              type="text"
              value={data[key]}
              onChange={(e) => updateField(key, e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-slate-100"
              placeholder={placeholder}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
