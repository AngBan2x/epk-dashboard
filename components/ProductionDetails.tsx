import { safeString, hasValue } from "@/lib/null-safe";
import type { ProductionDetails as ProductionDetailsType } from "@/types/music";

interface ProductionDetailsProps {
  details: ProductionDetailsType;
}

export function ProductionDetails({ details }: ProductionDetailsProps) {
  const fields = [
    { label: "DAW", key: "daw" as const },
    { label: "Guitarras", key: "guitars" as const },
    { label: "Efectos", key: "effects_chain" as const },
    { label: "Afinación", key: "tuning" as const },
    { label: "Tonalidad", key: "key" as const },
  ];

  return (
    <div className="space-y-2">
      <h3 className="font-semibold text-lg mb-3">Ficha de Producción</h3>
      <dl className="grid grid-cols-2 gap-2">
        {fields.map(({ label, key }) => (
          <div key={key}>
            <dt className="text-xs text-dark-500 uppercase">{label}</dt>
            <dd className="text-sm font-medium">
              {hasValue(details, key) ? safeString(details[key]) : <span className="text-dark-300">—</span>}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
