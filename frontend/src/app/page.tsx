import { Suspense } from 'react'
import { getDashboardStats, getTopCustomers, getMrrByPlan, getRetentionMetrics, getMrrHistory } from '@/lib/supabase'
import {
  DollarSign,
  Users,
  TrendingUp,
  AlertTriangle,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  TrendingDown,
  Percent,
  RefreshCw,
} from 'lucide-react'
import { MrrChart } from '@/components/MrrChart'

// Format currency
function formatCurrency(value: number): string {
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(2)}M`
  }
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(0)}K`
  }
  return `$${value.toFixed(0)}`
}

// Stat Card Component
function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  trendUp,
}: {
  title: string
  value: string
  subtitle?: string
  icon: React.ComponentType<{ className?: string }>
  trend?: string
  trendUp?: boolean
}) {
  return (
    <div className="card">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-caption text-[var(--text-muted)] font-medium">{title}</p>
          <p className="text-title text-[var(--text)] mt-2">{value}</p>
          {subtitle && (
            <p className="text-caption text-[var(--text-subtle)] mt-1">{subtitle}</p>
          )}
          {trend && (
            <div className={`flex items-center gap-1 mt-2 text-caption ${trendUp ? 'text-[var(--success-text)]' : 'text-red-500'}`}>
              {trendUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
              <span>{trend}</span>
            </div>
          )}
        </div>
        <div className="p-2.5 bg-[var(--primary-light)] rounded-md">
          <Icon className="w-5 h-5 text-[var(--primary)]" />
        </div>
      </div>
    </div>
  )
}

// Health Distribution Bar
function HealthDistribution({
  healthy,
  atRisk,
  critical,
}: {
  healthy: number
  atRisk: number
  critical: number
}) {
  const total = healthy + atRisk + critical
  if (total === 0) return null

  const healthyPct = (healthy / total) * 100
  const atRiskPct = (atRisk / total) * 100
  const criticalPct = (critical / total) * 100

  return (
    <div className="card">
      <h3 className="text-body-strong text-[var(--text)] mb-4">Customer Health Distribution</h3>

      {/* Segmented Bar */}
      <div className="h-3 rounded-pill overflow-hidden flex mb-4">
        <div
          className="bg-[var(--success-text)] transition-all"
          style={{ width: `${healthyPct}%` }}
        />
        <div
          className="bg-[var(--warning-text)] transition-all"
          style={{ width: `${atRiskPct}%` }}
        />
        <div
          className="bg-red-500 transition-all"
          style={{ width: `${criticalPct}%` }}
        />
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-6 text-caption">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-[var(--success-text)]" />
          <span className="text-[var(--text-muted)]">Healthy</span>
          <span className="font-semibold text-[var(--text)]">{healthy}</span>
          <span className="text-[var(--text-subtle)]">({healthyPct.toFixed(0)}%)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-[var(--warning-text)]" />
          <span className="text-[var(--text-muted)]">At Risk</span>
          <span className="font-semibold text-[var(--text)]">{atRisk}</span>
          <span className="text-[var(--text-subtle)]">({atRiskPct.toFixed(0)}%)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
          <span className="text-[var(--text-muted)]">Critical</span>
          <span className="font-semibold text-[var(--text)]">{critical}</span>
          <span className="text-[var(--text-subtle)]">({criticalPct.toFixed(0)}%)</span>
        </div>
      </div>
    </div>
  )
}

// Top Customers Table
async function TopCustomersTable() {
  const customers = await getTopCustomers(10)

  return (
    <div className="card !p-0 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
        <h3 className="text-body-strong text-[var(--text)]">Top Customers by MRR</h3>
        <a href="/customers" className="text-caption text-[var(--primary)] hover:underline">
          View all →
        </a>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="table-header">
              <th className="text-left">Customer</th>
              <th className="text-left">Plan</th>
              <th className="text-right">MRR</th>
              <th className="text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((customer) => (
              <tr
                key={customer.customer_id}
                className="table-row cursor-pointer"
              >
                <td className="py-2 px-3">
                  <div className="flex items-center gap-3">
                    <div className="avatar avatar-sm bg-[var(--primary-light)] text-[var(--primary)]">
                      {(customer.name || customer.email)[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-body-strong text-[var(--text)] truncate">
                        {customer.name || customer.email.split('@')[0]}
                      </p>
                      <p className="text-caption text-[var(--text-muted)] truncate">{customer.email}</p>
                    </div>
                  </div>
                </td>
                <td className="py-2 px-3">
                  <span className="badge-info">{customer.plan_name || 'Unknown'}</span>
                </td>
                <td className="py-2 px-3 text-right">
                  <span className="text-body-strong text-[var(--text)]">
                    ${customer.mrr?.toLocaleString() || 0}
                  </span>
                </td>
                <td className="py-2 px-3 text-center">
                  {customer.subscription_status === 'active' ? (
                    <span className="badge-success">Active</span>
                  ) : (
                    <span className="badge-warning">{customer.subscription_status}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Retention Metrics Cards
function RetentionMetrics({
  nrr,
  grr,
  churnRate,
  expansionRate,
}: {
  nrr: number
  grr: number
  churnRate: number
  expansionRate: number
}) {
  return (
    <div className="card">
      <h3 className="text-body-strong text-[var(--text)] mb-4">Revenue Retention Metrics</h3>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* NRR */}
        <div className="p-3 bg-[var(--surface-muted)] rounded-md">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-[var(--primary)]" />
            <span className="text-caption text-[var(--text-muted)]">NRR</span>
          </div>
          <p className={`text-title ${nrr >= 100 ? 'text-[var(--success-text)]' : 'text-[var(--warning-text)]'}`}>
            {nrr.toFixed(1)}%
          </p>
          <p className="text-caption text-[var(--text-subtle)] mt-0.5">Net Revenue Retention</p>
        </div>

        {/* GRR */}
        <div className="p-3 bg-[var(--surface-muted)] rounded-md">
          <div className="flex items-center gap-2 mb-1">
            <RefreshCw className="w-4 h-4 text-[var(--primary)]" />
            <span className="text-caption text-[var(--text-muted)]">GRR</span>
          </div>
          <p className={`text-title ${grr >= 90 ? 'text-[var(--success-text)]' : grr >= 80 ? 'text-[var(--warning-text)]' : 'text-red-500'}`}>
            {grr.toFixed(1)}%
          </p>
          <p className="text-caption text-[var(--text-subtle)] mt-0.5">Gross Revenue Retention</p>
        </div>

        {/* Churn Rate */}
        <div className="p-3 bg-[var(--surface-muted)] rounded-md">
          <div className="flex items-center gap-2 mb-1">
            <TrendingDown className="w-4 h-4 text-red-500" />
            <span className="text-caption text-[var(--text-muted)]">Churn</span>
          </div>
          <p className={`text-title ${churnRate <= 5 ? 'text-[var(--success-text)]' : churnRate <= 10 ? 'text-[var(--warning-text)]' : 'text-red-500'}`}>
            {churnRate.toFixed(1)}%
          </p>
          <p className="text-caption text-[var(--text-subtle)] mt-0.5">Monthly Churn Rate</p>
        </div>

        {/* Expansion Rate */}
        <div className="p-3 bg-[var(--surface-muted)] rounded-md">
          <div className="flex items-center gap-2 mb-1">
            <Percent className="w-4 h-4 text-[var(--success-text)]" />
            <span className="text-caption text-[var(--text-muted)]">Expansion</span>
          </div>
          <p className={`text-title ${expansionRate >= 5 ? 'text-[var(--success-text)]' : 'text-[var(--text)]'}`}>
            {expansionRate.toFixed(1)}%
          </p>
          <p className="text-caption text-[var(--text-subtle)] mt-0.5">Expansion Rate</p>
        </div>
      </div>
    </div>
  )
}

// MRR by Plan
async function MrrByPlanChart() {
  const planData = await getMrrByPlan()
  const totalMrr = planData.reduce((sum, p) => sum + p.mrr, 0)

  const colors = ['#5273FF', '#2BB76C', '#660CFB', '#C58D17', '#EF4444', '#EC4899']

  return (
    <div className="card">
      <h3 className="text-body-strong text-[var(--text)] mb-4">MRR by Plan</h3>

      {/* Bar chart */}
      <div className="space-y-4">
        {planData.slice(0, 6).map((plan, i) => {
          const pct = (plan.mrr / totalMrr) * 100
          return (
            <div key={plan.plan}>
              <div className="flex justify-between text-caption mb-1.5">
                <span className="text-[var(--text)]">{plan.plan}</span>
                <span className="text-body-strong text-[var(--text)]">${plan.mrr.toLocaleString()}</span>
              </div>
              <div className="h-2 bg-[var(--surface-muted)] rounded-pill overflow-hidden">
                <div
                  className="h-full rounded-pill transition-all"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: colors[i % colors.length],
                  }}
                />
              </div>
              <div className="flex justify-between text-caption text-[var(--text-muted)] mt-1">
                <span>{plan.count} customers</span>
                <span>{pct.toFixed(1)}%</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Main Dashboard
async function DashboardContent() {
  const [stats, retentionMetrics, mrrHistory] = await Promise.all([
    getDashboardStats(),
    getRetentionMetrics(),
    getMrrHistory(12),
  ])

  return (
    <div className="p-4 lg:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-title text-[var(--text)]">Dashboard</h1>
          <p className="text-caption text-[var(--text-muted)] mt-1">
            Overview of your customer health and revenue
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button className="btn-secondary btn-sm">
            Export
          </button>
          <button className="btn-primary btn-sm">
            Sync Data
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Monthly Recurring Revenue"
          value={formatCurrency(stats.totalMrr)}
          subtitle={`${formatCurrency(stats.totalArr)} ARR`}
          icon={DollarSign}
        />
        <StatCard
          title="Paying Customers"
          value={stats.payingCustomers.toLocaleString()}
          subtitle={`${stats.totalCustomers.toLocaleString()} total contacts`}
          icon={Users}
        />
        <StatCard
          title="Avg Health Score"
          value={stats.avgHealthScore ? stats.avgHealthScore.toFixed(0) : '—'}
          subtitle="0-100 scale"
          icon={Activity}
        />
        <StatCard
          title="At Risk"
          value={(stats.atRiskCount + stats.criticalCount).toString()}
          subtitle={`${stats.criticalCount} critical`}
          icon={AlertTriangle}
        />
      </div>

      {/* Retention Metrics */}
      <RetentionMetrics
        nrr={retentionMetrics.nrr}
        grr={retentionMetrics.grr}
        churnRate={retentionMetrics.churnRate}
        expansionRate={retentionMetrics.expansionRate}
      />

      {/* Health Distribution */}
      <HealthDistribution
        healthy={stats.healthyCount}
        atRisk={stats.atRiskCount}
        critical={stats.criticalCount}
      />

      {/* MRR Over Time Chart */}
      <MrrChart data={mrrHistory} />

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TopCustomersTable />
        <MrrByPlanChart />
      </div>
    </div>
  )
}

// Loading fallback
function DashboardSkeleton() {
  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="skeleton h-6 w-32" />
          <div className="skeleton h-4 w-48 mt-2" />
        </div>
        <div className="flex gap-3">
          <div className="skeleton h-8 w-20" />
          <div className="skeleton h-8 w-24" />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton h-28 rounded-md" />
        ))}
      </div>
      {/* Retention Metrics Skeleton */}
      <div className="skeleton h-32 rounded-md" />
      {/* Health Distribution Skeleton */}
      <div className="skeleton h-20 rounded-md" />
      {/* MRR Chart Skeleton */}
      <div className="skeleton h-80 rounded-md" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="skeleton h-80 rounded-md" />
        <div className="skeleton h-80 rounded-md" />
      </div>
    </div>
  )
}

export default function Dashboard() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardContent />
    </Suspense>
  )
}
