'use client'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from 'recharts'
import { MrrSnapshot } from '@/lib/supabase'

interface MrrChartProps {
  data: MrrSnapshot[]
}

function formatCurrency(value: number): string {
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`
  }
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(0)}K`
  }
  return `$${value.toFixed(0)}`
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}

export function MrrChart({ data }: MrrChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="card">
        <h3 className="text-body-strong text-[var(--text)] mb-4">MRR Over Time</h3>
        <div className="h-64 flex items-center justify-center text-[var(--text-muted)]">
          No historical data available yet
        </div>
      </div>
    )
  }

  const chartData = data.map((snapshot) => ({
    date: formatDate(snapshot.snapshot_date),
    mrr: snapshot.total_mrr,
    arr: snapshot.total_arr,
    customers: snapshot.paying_customers,
  }))

  return (
    <div className="card">
      <h3 className="text-body-strong text-[var(--text)] mb-4">MRR Over Time</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="mrrGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#5273FF" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#5273FF" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
              tickLine={false}
              axisLine={{ stroke: 'var(--border)' }}
            />
            <YAxis
              tickFormatter={formatCurrency}
              tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              width={60}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              }}
              labelStyle={{ color: 'var(--text)', fontWeight: 600 }}
              formatter={(value: number) => [formatCurrency(value), 'MRR']}
            />
            <Area
              type="monotone"
              dataKey="mrr"
              stroke="#5273FF"
              strokeWidth={2}
              fill="url(#mrrGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
