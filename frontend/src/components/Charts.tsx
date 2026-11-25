import React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function ModelPerformanceChart({
  data,
}: {
  data: Array<{ model: string; accuracy: number; brier: number; logLoss: number }>;
}) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
          <XAxis dataKey="model" stroke="#94A3B8" fontSize={12} />
          <YAxis stroke="#94A3B8" fontSize={12} />
          <Tooltip
            contentStyle={{ backgroundColor: "#0F172A", borderColor: "#334155", borderRadius: 8 }}
          />
          <Legend />
          <Bar dataKey="accuracy" name="Doğruluk (%)" fill="#10B981" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CalibrationCurveChart({
  data,
}: {
  data: Array<{ bin: string; predicted: number; actual: number }>;
}) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
          <XAxis dataKey="bin" stroke="#94A3B8" fontSize={12} />
          <YAxis stroke="#94A3B8" fontSize={12} domain={[0, 100]} />
          <Tooltip
            contentStyle={{ backgroundColor: "#0F172A", borderColor: "#334155", borderRadius: 8 }}
          />
          <Legend />
          <Line type="monotone" dataKey="predicted" name="Tahmin Edilen (%)" stroke="#38BDF8" strokeWidth={2} />
          <Line type="monotone" dataKey="actual" name="Gerçekleşen (%)" stroke="#10B981" strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
