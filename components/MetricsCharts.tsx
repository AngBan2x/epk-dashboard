"use client";

import { useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend } from "recharts";
import type { TopCountry } from "@/types/music";
import { safeArray } from "@/lib/null-safe";

interface MetricsChartsProps {
  top_countries: TopCountry[];
  streams: number;
  saves: number;
  playlist_additions: number;
  trackId?: string;
}

interface MetricsHistoryPoint {
  date: string;
  streams: number;
  saves: number;
  playlist_additions: number;
}

const COLORS = ["#ec4899", "#8b5cf6", "#06b6d4", "#f59e0b", "#10b981"];

export function MetricsCharts({ top_countries, streams, saves, playlist_additions, trackId }: MetricsChartsProps) {
  const countries = safeArray<TopCountry>(top_countries);
  const pieData = [
    { name: "Streams", value: streams },
    { name: "Saves", value: saves },
    { name: "Playlists", value: playlist_additions },
  ].filter((d) => d.value > 0);

  const [history, setHistory] = useState<MetricsHistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!trackId) {
      setHistory([]);
      setLoading(false);
      return;
    }

    fetch(`/api/metrics/history?track_id=${trackId}&limit=30`)
      .then((res) => res.json())
      .then((data) => {
        setHistory(data.reverse().map((h: any) => ({
          date: h.date,
          streams: h.streams,
          saves: h.saves,
          playlist_additions: h.playlist_additions,
        })));
      })
      .catch(() => setHistory([]))
      .finally(() => setLoading(false));
  }, [trackId]);

  return (
    <div className="space-y-6">
      {/* Current Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard title="Streams" value={streams} icon="▶" color="#ec4899" />
        <MetricCard title="Saves" value={saves} icon="♥" color="#8b5cf6" />
        <MetricCard title="Playlists" value={playlist_additions} icon="♫" color="#06b6d4" />
      </div>

      {/* Top Countries */}
      <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
        <h3 className="font-semibold mb-4 text-slate-900 dark:text-slate-100">Top Países</h3>
        {countries.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={countries}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="country" fontSize={12} tick={{ fill: "#64748b" }} />
              <YAxis fontSize={12} tick={{ fill: "#64748b" }} />
              <Tooltip 
                contentStyle={{ backgroundColor: "#1e293b", border: "none", borderRadius: "8px" }}
                labelStyle={{ color: "#f8fafc" }}
              />
              <Bar dataKey="pct" fill="#ec4899" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-slate-400 text-sm text-center py-8">Sin datos de países</p>
        )}
      </div>

      {/* Metrics Distribution */}
      <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
        <h3 className="font-semibold mb-4 text-slate-900 dark:text-slate-100">Distribución de Métricas</h3>
        {pieData.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie 
                data={pieData} 
                cx="50%" 
                cy="50%" 
                outerRadius={80} 
                innerRadius={40}
                dataKey="value" 
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                labelLine={false}
              >
                {pieData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ backgroundColor: "#1e293b", border: "none", borderRadius: "8px" }}
                formatter={(value: number, name: string) => [value.toLocaleString(), name]}
              />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-slate-400 text-sm text-center py-8">Sin métricas para mostrar</p>
        )}
      </div>

      {/* Historical Trends - Real Time */}
      {trackId && (
        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
          <h3 className="font-semibold mb-4 text-slate-900 dark:text-slate-100">Tendencia Histórica (30 días)</h3>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-ec4899 border-t-transparent"></div>
            </div>
          ) : history.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={history}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis 
                  dataKey="date" 
                  fontSize={11} 
                  tick={{ fill: "#64748b" }}
                  tickFormatter={(value) => new Date(value).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" })}
                  interval={Math.max(1, Math.floor(history.length / 8))}
                />
                <YAxis fontSize={11} tick={{ fill: "#64748b" }} tickFormatter={(value) => value.toLocaleString()} />
                <Tooltip 
                  contentStyle={{ backgroundColor: "#1e293b", border: "none", borderRadius: "8px" }}
                  labelFormatter={(value) => new Date(value).toLocaleDateString("es-ES", { weekday: "short", day: "2-digit", month: "2-digit" })}
                  formatter={(value: number, name: string) => [value.toLocaleString(), name]}
                />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="streams" 
                  stroke="#ec4899" 
                  strokeWidth={2} 
                  dot={false}
                  activeDot={{ r: 6, strokeWidth: 2 }}
                  name="Streams"
                />
                <Line 
                  type="monotone" 
                  dataKey="saves" 
                  stroke="#8b5cf6" 
                  strokeWidth={2} 
                  dot={false}
                  activeDot={{ r: 6, strokeWidth: 2 }}
                  name="Saves"
                />
                <Line 
                  type="monotone" 
                  dataKey="playlist_additions" 
                  stroke="#06b6d4" 
                  strokeWidth={2} 
                  dot={false}
                  activeDot={{ r: 6, strokeWidth: 2 }}
                  name="Playlists"
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-slate-400 text-sm text-center py-8">Sin historial de métricas disponible</p>
          )}
        </div>
      )}
    </div>
  );
}

function MetricCard({ title, value, icon, color }: { title: string; value: number; icon: string; color: string }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 text-center">
      <div className="text-3xl mb-1" style={{ color }}>{icon}</div>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">{title}</p>
      <p className="text-2xl font-bold" style={{ color }}>{value.toLocaleString()}</p>
    </div>
  );
}