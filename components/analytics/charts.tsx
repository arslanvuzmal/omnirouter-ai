'use client';

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type { DailyPoint, DistributionSlice } from '@/lib/analytics/queries';

/**
 * Analytics charts.
 *
 * Colour is used to distinguish series, never as the sole carrier of meaning —
 * every chart is accompanied by a table or explicit labels so the data is
 * readable without relying on hue discrimination.
 */

const COLOURS = {
  primary: '#38cee8',
  accent: '#9179ea',
  success: '#34d399',
  warning: '#fbbf24',
  danger: '#fb7185',
  grid: '#1e2532',
  text: '#8b98ab',
};

const SERIES_PALETTE = [
  COLOURS.primary,
  COLOURS.accent,
  COLOURS.success,
  COLOURS.warning,
  COLOURS.danger,
];

/**
 * Recharts types axis ticks as string but tooltip labels as ReactNode, so this
 * accepts the wider type and degrades gracefully on anything unexpected.
 */
function shortDay(value: unknown): string {
  if (typeof value !== 'string') return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getUTCDate()}/${date.getUTCMonth() + 1}`;
}

/** Tooltip values arrive as a union; coerce before formatting. */
function toNumber(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

const TOOLTIP_STYLE = {
  backgroundColor: '#161c27',
  border: '1px solid #2a3341',
  borderRadius: '8px',
  fontSize: '11px',
  color: '#f5f8fc',
};

export function RequestVolumeChart({ data }: { data: DailyPoint[] }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <defs>
            <linearGradient id="fillSucceeded" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COLOURS.success} stopOpacity={0.35} />
              <stop offset="100%" stopColor={COLOURS.success} stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="fillFailed" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COLOURS.danger} stopOpacity={0.35} />
              <stop offset="100%" stopColor={COLOURS.danger} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={COLOURS.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="day"
            tickFormatter={shortDay}
            stroke={COLOURS.text}
            fontSize={10}
            tickLine={false}
            axisLine={false}
            minTickGap={24}
          />
          <YAxis
            stroke={COLOURS.text}
            fontSize={10}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
          />
          <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={shortDay} />
          <Legend wrapperStyle={{ fontSize: '11px', color: COLOURS.text }} />
          <Area
            type="monotone"
            dataKey="succeeded"
            name="Succeeded"
            stroke={COLOURS.success}
            fill="url(#fillSucceeded)"
            strokeWidth={2}
            stackId="1"
          />
          <Area
            type="monotone"
            dataKey="failed"
            name="Failed"
            stroke={COLOURS.danger}
            fill="url(#fillFailed)"
            strokeWidth={2}
            stackId="1"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function FallbackTrendChart({ data }: { data: DailyPoint[] }) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid stroke={COLOURS.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="day"
            tickFormatter={shortDay}
            stroke={COLOURS.text}
            fontSize={10}
            tickLine={false}
            axisLine={false}
            minTickGap={24}
          />
          <YAxis
            stroke={COLOURS.text}
            fontSize={10}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
          />
          <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={shortDay} />
          <Line
            type="monotone"
            dataKey="fallbacks"
            name="Fallbacks"
            stroke={COLOURS.warning}
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CostTrendChart({ data }: { data: DailyPoint[] }) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
          <defs>
            <linearGradient id="fillCost" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COLOURS.primary} stopOpacity={0.35} />
              <stop offset="100%" stopColor={COLOURS.primary} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={COLOURS.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="day"
            tickFormatter={shortDay}
            stroke={COLOURS.text}
            fontSize={10}
            tickLine={false}
            axisLine={false}
            minTickGap={24}
          />
          <YAxis
            stroke={COLOURS.text}
            fontSize={10}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value: number) => `$${value.toFixed(4)}`}
            width={62}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelFormatter={shortDay}
            formatter={(value: unknown) => [
              `$${toNumber(value).toFixed(6)}`,
              'Estimated cost',
            ]}
          />
          <Area
            type="monotone"
            dataKey="estimatedCost"
            name="Estimated cost"
            stroke={COLOURS.primary}
            fill="url(#fillCost)"
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DistributionChart({
  data,
  label,
}: {
  data: DistributionSlice[];
  label: string;
}) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 16, bottom: 4, left: 4 }}
        >
          <CartesianGrid stroke={COLOURS.grid} strokeDasharray="3 3" horizontal={false} />
          <XAxis
            type="number"
            stroke={COLOURS.text}
            fontSize={10}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
          />
          <YAxis
            type="category"
            dataKey="label"
            stroke={COLOURS.text}
            fontSize={10}
            tickLine={false}
            axisLine={false}
            width={110}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(value: unknown) => [toNumber(value), label]}
            cursor={{ fill: 'rgba(58,69,87,0.25)' }}
          />
          <Bar dataKey="requests" name={label} radius={[0, 4, 4, 0]}>
            {data.map((entry, index) => (
              <Cell
                key={entry.label}
                fill={SERIES_PALETTE[index % SERIES_PALETTE.length]}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
