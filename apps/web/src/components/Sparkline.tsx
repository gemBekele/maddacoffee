import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  YAxis,
} from 'recharts';

/**
 * A compact trend line for a KPI card.
 *
 * Deliberately axis-free: it conveys direction and volatility, not values. The
 * card's headline number carries the value, so an axis here would be noise.
 */
export function Sparkline({
  data,
  dataKey = 'value',
  colour = '#4c6b46',
  height = 34,
  fill = true,
  formatValue,
}: {
  data: any[];
  dataKey?: string;
  colour?: string;
  height?: number;
  fill?: boolean;
  formatValue?: (v: number) => string;
}) {
  if (!data?.length) {
    return <div style={{ height }} className="rounded bg-slate-100/60" />;
  }

  const values = data.map((d) => Number(d[dataKey] ?? 0));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const id = `spark-${colour.replace('#', '')}-${dataKey}`;

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colour} stopOpacity={0.35} />
              <stop offset="100%" stopColor={colour} stopOpacity={0} />
            </linearGradient>
          </defs>
          {/* Pad the domain so a flat line sits mid-height rather than on the edge. */}
          <YAxis hide domain={[min === max ? min - 1 : min, max === min ? max + 1 : max]} />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const v = Number(payload[0].value ?? 0);
              return (
                <div className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] shadow">
                  {formatValue ? formatValue(v) : v.toLocaleString()}
                </div>
              );
            }}
          />
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={colour}
            strokeWidth={1.75}
            fill={fill ? `url(#${id})` : 'transparent'}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
