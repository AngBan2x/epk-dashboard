"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import type { TopCountry } from "@/types/music";
import { safeArray } from "@/lib/null-safe";

interface MetricsChartsProps {
  top_countries: TopCountry[];
  streams: number;
  saves: number;
  playlist_additions: number;
}

const COLORS = ["#ec4899", "#8b5cf6", "#06b6d4", "#f59e0b", "#10b981"];

export function MetricsCharts({ top_countries, streams, saves, playlist_additions }: MetricsChartsProps) {
  const countries = safeArray<TopCountry>(top_countries);
  const pieData = [
    { name: "Streams", value: streams },
    { name: "Saves", value: saves },
    { name: "Playlists", value: playlist_additions },
  ].filter((d) => d.value > 0);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="bg-white dark:bg-dark-800 rounded-xl p-4 border border-dark-200 dark:border-dark-700">
        <h3 className="font-semibold mb-4">Top Países</h3>
        {countries.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={countries}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="country" fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip />
              <Bar dataKey="pct" fill="#ec4899" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-dark-400 text-sm">Sin datos</p>
        )}
      </div>

      <div className="bg-white dark:bg-dark-800 rounded-xl p-4 border border-dark-200 dark:border-dark-700">
        <h3 className="font-semibold mb-4">Métricas</h3>
        {pieData.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                {pieData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-dark-400 text-sm">Sin datos</p>
        )}
      </div>
    </div>
  );
}
