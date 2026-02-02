import { Suspense } from 'react'
import { getDashboardStats, getRetentionMetrics, getCustomers } from '@/lib/supabase'
import {
  TrendingUp,
  TrendingDown,
  Users,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  Target,
  Zap,
  UserPlus,
  UserMinus,
} from 'lucide-react'
import CustomerFunnelSankey from '@/components/CustomerFunnelSankey'
import { LoadingOverlay } from '@/components/LoadingSpinner'

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

// Metric Card with trend
function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  trendUp,
  color = 'primary',
}: {
  title: string
  value: string
  subtitle?: string
  icon: React.ComponentType<{ className?: string }>
  trend?: string
  trendUp?: boolean
  color?: 'primary' | 'success' | 'warning' | 'violet'
}) {
  const colorClasses = {
    primary: {
      bg: 'bg-[var(--primary-light)]',
      text: 'text-[var(--primary)]',
    },
    success: {
      bg: 'bg-[var(--success-bg)]',
      text: 'text-[var(--success-text)]',
    },
    warning: {
      bg: 'bg-[var(--warning-bg)]',
      text: 'text-[var(--warning-text)]',
    },
    violet: {
      bg: 'bg-[var(--violet-bg)]',
      text: 'text-[var(--violet-text)]',
    },
  }

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
        <div className={`p-2.5 ${colorClasses[color].bg} rounded-md`}>
          <Icon className={`w-5 h-5 ${colorClasses[color].text}`} />
        </div>
      </div>
    </div>
  )
}

// Stage Performance Card
function StagePerformanceCard({
  stage,
  metrics,
}: {
  stage: string
  metrics: { label: string; value: string; change?: string; positive?: boolean }[]
}) {
  const stageColors: Record<string, { bg: string; border: string; text: string }> = {
    Acquisition: {
      bg: 'rgba(82, 115, 255, 0.1)',
      border: 'rgba(82, 115, 255, 0.2)',
      text: '#5273FF',
    },
    Conversion: {
      bg: 'rgba(102, 12, 251, 0.1)',
      border: 'rgba(102, 12, 251, 0.2)',
      text: '#660CFB',
    },
    Experience: {
      bg: 'rgba(43, 183, 108, 0.1)',
      border: 'rgba(43, 183, 108, 0.2)',
      text: '#2BB76C',
    },
  }

  const colors = stageColors[stage] || stageColors.Acquisition

  return (
    <div className="card !p-0 overflow-hidden">
      <div
        className="px-4 py-3 border-b"
        style={{ background: colors.bg, borderColor: colors.border }}
      >
        <h3 className="text-body-strong" style={{ color: colors.text }}>
          {stage}
        </h3>
      </div>
      <div className="divide-y divide-[var(--border)]">
        {metrics.map((metric, i) => (
          <div key={i} className="flex items-center justify-between px-4 py-3">
            <span className="text-body text-[var(--text-muted)]">{metric.label}</span>
            <div className="flex items-center gap-2">
              <span className="text-body-strong text-[var(--text)]">{metric.value}</span>
              {metric.change && (
                <span
                  className={`text-caption ${
                    metric.positive ? 'text-[var(--success-text)]' : 'text-red-500'
                  }`}
                >
                  {metric.change}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Conversion Rate Visualization
function ConversionFunnel({
  steps,
}: {
  steps: { label: string; value: number; rate?: string }[]
}) {
  const maxValue = Math.max(...steps.map(s => s.value))

  return (
    <div className="card">
      <h3 className="text-body-strong text-[var(--text)] mb-4">Conversion Funnel</h3>
      <div className="space-y-3">
        {steps.map((step, i) => {
          const width = (step.value / maxValue) * 100
          const isLast = i === steps.length - 1

          return (
            <div key={step.label}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-body text-[var(--text)]">{step.label}</span>
                <div className="flex items-center gap-2">
                  <span className="text-body-strong text-[var(--text)]">
                    {step.value.toLocaleString()}
                  </span>
                  {step.rate && (
                    <span className="text-caption text-[var(--text-muted)]">
                      ({step.rate})
                    </span>
                  )}
                </div>
              </div>
              <div className="h-2.5 bg-[var(--surface-muted)] rounded-pill overflow-hidden">
                <div
                  className="h-full rounded-pill transition-all duration-500"
                  style={{
                    width: `${width}%`,
                    background: `linear-gradient(90deg, ${
                      i === 0
                        ? '#5273FF'
                        : i === 1
                        ? '#7C5CE8'
                        : i === 2
                        ? '#660CFB'
                        : '#2BB76C'
                    }, ${
                      i === 0
                        ? '#3A5AE6'
                        : i === 1
                        ? '#5209C9'
                        : i === 2
                        ? '#4A07B8'
                        : '#229958'
                    })`,
                  }}
                />
              </div>
              {!isLast && (
                <div className="flex justify-center my-1">
                  <TrendingDown className="w-4 h-4 text-[var(--text-subtle)]" />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Main Analytics Content
async function AnalyticsContent() {
  const [stats, retentionMetrics, customersResult] = await Promise.all([
    getDashboardStats(),
    getRetentionMetrics(),
    getCustomers({ limit: 1000 }),
  ])

  const customers = customersResult.customers

  // Calculate funnel metrics
  const totalCustomers = stats.totalCustomers
  const payingCustomers = stats.payingCustomers
  const activeCustomers = customers.filter(c => c.subscription_status === 'active').length
  const trialCustomers = customers.filter(c => c.subscription_status === 'trialing').length

  // Calculate health distribution for experience stage
  const healthyCustomers = stats.healthyCount
  const atRiskCustomers = stats.atRiskCount + stats.criticalCount
  const churnedCustomers = Math.round(payingCustomers * (retentionMetrics.churnRate / 100))
  const expandingCustomers = Math.round(healthyCustomers * 0.3)

  // Estimate traffic source distribution (can be replaced with real data later)
  const totalLeads = totalCustomers * 2
  const paidAdsLeads = Math.round(totalLeads * 0.28)
  const seoLeads = Math.round(totalLeads * 0.32)
  const affiliateLeads = Math.round(totalLeads * 0.15)
  const socialMediaLeads = Math.round(totalLeads * 0.14)
  const contentMarketingLeads = Math.round(totalLeads * 0.11)

  // Free plan users (product-led) vs sales demo (sales-led)
  const freePlanUsers = totalCustomers - payingCustomers + trialCustomers
  const salesDemoLeads = Math.round(payingCustomers * 0.35) // ~35% come through sales

  // Conversion rates
  const productLedConversions = Math.round(payingCustomers * 0.65) // 65% from product-led
  const salesLedConversions = Math.round(payingCustomers * 0.35) // 35% from sales-led

  // Build funnel data based on actual customer data
  const funnelData = {
    nodes: [
      // Acquisition Stage - Traffic Sources
      { id: 'paid_ads', label: 'Paid Ads', value: paidAdsLeads, stage: 'acquisition' as const, color: '#6D86FF' },
      { id: 'seo', label: 'SEO', value: seoLeads, stage: 'acquisition' as const, color: '#5273FF' },
      { id: 'affiliate', label: 'Affiliate', value: affiliateLeads, stage: 'acquisition' as const, color: '#4A6AE8' },
      { id: 'social_media', label: 'Social Media', value: socialMediaLeads, stage: 'acquisition' as const, color: '#3A5AE6' },
      { id: 'content_marketing', label: 'Content Marketing', value: contentMarketingLeads, stage: 'acquisition' as const, color: '#2E4BD1' },
      // Conversion Stage - Two Paths
      { id: 'free_plan', label: 'Free Plan', value: freePlanUsers, stage: 'conversion' as const, color: '#B794F6' },
      { id: 'sales_demo', label: 'Sales Demo', value: salesDemoLeads, stage: 'conversion' as const, color: '#A78BFA' },
      { id: 'paid_customers', label: 'Paid Customers', value: payingCustomers, stage: 'conversion' as const, color: '#660CFB' },
      // Experience stage - ordered to minimize link crossings
      { id: 'expanding', label: 'Expanding', value: expandingCustomers, stage: 'experience' as const, color: '#2BB76C' },
      { id: 'active', label: 'Active', value: healthyCustomers, stage: 'experience' as const, color: '#5DE0A0' },
      { id: 'churned', label: 'Churned', value: churnedCustomers, stage: 'experience' as const, color: '#EF4444' },
      { id: 'at_risk', label: 'At Risk', value: atRiskCustomers, stage: 'experience' as const, color: '#F5C15A' },
    ],
    links: [
      // Acquisition → Conversion (Product-Led path via Free Plan)
      { source: 'paid_ads', target: 'free_plan', value: Math.round(paidAdsLeads * 0.22) },
      { source: 'seo', target: 'free_plan', value: Math.round(seoLeads * 0.26) },
      { source: 'affiliate', target: 'free_plan', value: Math.round(affiliateLeads * 0.24) },
      { source: 'social_media', target: 'free_plan', value: Math.round(socialMediaLeads * 0.18) },
      { source: 'content_marketing', target: 'free_plan', value: Math.round(contentMarketingLeads * 0.20) },
      // Acquisition → Conversion (Sales-Led path via Demo)
      { source: 'paid_ads', target: 'sales_demo', value: Math.round(paidAdsLeads * 0.05) },
      { source: 'seo', target: 'sales_demo', value: Math.round(seoLeads * 0.04) },
      { source: 'affiliate', target: 'sales_demo', value: Math.round(affiliateLeads * 0.06) },
      { source: 'social_media', target: 'sales_demo', value: Math.round(socialMediaLeads * 0.03) },
      { source: 'content_marketing', target: 'sales_demo', value: Math.round(contentMarketingLeads * 0.04) },
      // Product-Led Conversion: Free Plan → Paid
      { source: 'free_plan', target: 'paid_customers', value: productLedConversions },
      { source: 'free_plan', target: 'churned', value: Math.round(freePlanUsers * 0.85) },
      // Sales-Led Conversion: Demo → Paid (higher conversion rate)
      { source: 'sales_demo', target: 'paid_customers', value: salesLedConversions },
      { source: 'sales_demo', target: 'churned', value: Math.round(salesDemoLeads * 0.45) },
      // Experience flow
      { source: 'paid_customers', target: 'active', value: healthyCustomers },
      { source: 'paid_customers', target: 'at_risk', value: atRiskCustomers },
      { source: 'paid_customers', target: 'churned', value: churnedCustomers },
      { source: 'paid_customers', target: 'expanding', value: Math.round(expandingCustomers * 0.7) },
      { source: 'active', target: 'expanding', value: Math.round(expandingCustomers * 0.3) },
      { source: 'at_risk', target: 'churned', value: Math.round(atRiskCustomers * 0.4) },
      { source: 'at_risk', target: 'active', value: Math.round(atRiskCustomers * 0.2) },
    ],
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-title text-[var(--text)]">Analytics</h1>
          <p className="text-caption text-[var(--text-muted)] mt-1">
            Customer journey funnel and conversion analytics
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button className="btn-secondary btn-sm">
            Export Report
          </button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Contacts"
          value={stats.totalCustomers.toLocaleString()}
          subtitle={`${payingCustomers.toLocaleString()} paying`}
          icon={Users}
          color="primary"
        />
        <MetricCard
          title="Net Revenue Retention"
          value={`${retentionMetrics.nrr.toFixed(1)}%`}
          subtitle="Month over month"
          icon={TrendingUp}
          trend={retentionMetrics.nrr >= 100 ? '+' + (retentionMetrics.nrr - 100).toFixed(1) + '%' : undefined}
          trendUp={retentionMetrics.nrr >= 100}
          color={retentionMetrics.nrr >= 100 ? 'success' : 'warning'}
        />
        <MetricCard
          title="Churn Rate"
          value={`${retentionMetrics.churnRate.toFixed(1)}%`}
          subtitle="Monthly customer churn"
          icon={UserMinus}
          color={retentionMetrics.churnRate <= 5 ? 'success' : 'warning'}
        />
        <MetricCard
          title="Expansion Rate"
          value={`${retentionMetrics.expansionRate.toFixed(1)}%`}
          subtitle="Revenue expansion"
          icon={UserPlus}
          trend={retentionMetrics.expansionRate > 0 ? `+${formatCurrency(retentionMetrics.expansion_mrr)}/mo` : undefined}
          trendUp={retentionMetrics.expansionRate > 0}
          color="success"
        />
      </div>

      {/* Sankey Chart - Full Width */}
      <CustomerFunnelSankey data={funnelData} height={450} />

      {/* Stage Performance Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <StagePerformanceCard
          stage="Acquisition"
          metrics={[
            { label: 'Total Leads', value: totalLeads.toLocaleString() },
            { label: 'Top Channel', value: 'SEO', change: `${((seoLeads / totalLeads) * 100).toFixed(0)}%`, positive: true },
            { label: 'Paid Ads', value: paidAdsLeads.toLocaleString(), change: `${((paidAdsLeads / totalLeads) * 100).toFixed(0)}%` },
            { label: 'Affiliate + Social', value: (affiliateLeads + socialMediaLeads).toLocaleString() },
          ]}
        />
        <StagePerformanceCard
          stage="Conversion"
          metrics={[
            { label: 'Free Plan Users', value: freePlanUsers.toLocaleString() },
            { label: 'Product-Led Conv.', value: `${((productLedConversions / freePlanUsers) * 100).toFixed(1)}%` },
            { label: 'Sales Demos', value: salesDemoLeads.toLocaleString() },
            { label: 'Sales-Led Conv.', value: `${((salesLedConversions / salesDemoLeads) * 100).toFixed(1)}%` },
          ]}
        />
        <StagePerformanceCard
          stage="Experience"
          metrics={[
            { label: 'Healthy Customers', value: healthyCustomers.toLocaleString(), change: `${(healthyCustomers / payingCustomers * 100).toFixed(0)}%`, positive: true },
            { label: 'At Risk Customers', value: atRiskCustomers.toLocaleString(), change: `${(atRiskCustomers / payingCustomers * 100).toFixed(0)}%`, positive: false },
            { label: 'Gross Retention', value: `${retentionMetrics.grr.toFixed(1)}%` },
            { label: 'Avg. Health Score', value: stats.avgHealthScore ? stats.avgHealthScore.toFixed(0) : '—' },
          ]}
        />
      </div>

      {/* Conversion Funnel Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ConversionFunnel
          steps={[
            { label: 'Total Leads', value: totalLeads },
            { label: 'Free Plan Signups', value: freePlanUsers, rate: `${((freePlanUsers / totalLeads) * 100).toFixed(1)}%` },
            { label: 'Sales Demos', value: salesDemoLeads, rate: `${((salesDemoLeads / totalLeads) * 100).toFixed(1)}%` },
            { label: 'Paid Customers', value: payingCustomers, rate: `${((payingCustomers / (freePlanUsers + salesDemoLeads)) * 100).toFixed(1)}%` },
          ]}
        />

        {/* Revenue Movement */}
        <div className="card">
          <h3 className="text-body-strong text-[var(--text)] mb-4">Monthly Revenue Movement</h3>
          <div className="space-y-4">
            {/* New MRR */}
            <div className="flex items-center justify-between p-3 bg-[var(--success-bg)] rounded-md">
              <div className="flex items-center gap-3">
                <UserPlus className="w-5 h-5 text-[var(--success-text)]" />
                <span className="text-body text-[var(--text)]">New MRR</span>
              </div>
              <span className="text-body-strong text-[var(--success-text)]">
                +{formatCurrency(retentionMetrics.new_mrr)}
              </span>
            </div>

            {/* Expansion MRR */}
            <div className="flex items-center justify-between p-3 bg-[var(--success-bg)] rounded-md">
              <div className="flex items-center gap-3">
                <TrendingUp className="w-5 h-5 text-[var(--success-text)]" />
                <span className="text-body text-[var(--text)]">Expansion MRR</span>
              </div>
              <span className="text-body-strong text-[var(--success-text)]">
                +{formatCurrency(retentionMetrics.expansion_mrr)}
              </span>
            </div>

            {/* Contraction MRR */}
            <div className="flex items-center justify-between p-3 bg-[var(--warning-bg)] rounded-md">
              <div className="flex items-center gap-3">
                <TrendingDown className="w-5 h-5 text-[var(--warning-text)]" />
                <span className="text-body text-[var(--text)]">Contraction MRR</span>
              </div>
              <span className="text-body-strong text-[var(--warning-text)]">
                -{formatCurrency(retentionMetrics.contraction_mrr)}
              </span>
            </div>

            {/* Churned MRR */}
            <div className="flex items-center justify-between p-3 bg-red-500/10 rounded-md">
              <div className="flex items-center gap-3">
                <UserMinus className="w-5 h-5 text-red-500" />
                <span className="text-body text-[var(--text)]">Churned MRR</span>
              </div>
              <span className="text-body-strong text-red-500">
                -{formatCurrency(retentionMetrics.churned_mrr)}
              </span>
            </div>

            {/* Net Change */}
            <div className="border-t border-[var(--border)] pt-4 mt-4">
              <div className="flex items-center justify-between">
                <span className="text-body-strong text-[var(--text)]">Net MRR Change</span>
                <span
                  className={`text-title ${
                    retentionMetrics.new_mrr + retentionMetrics.expansion_mrr - retentionMetrics.churned_mrr - retentionMetrics.contraction_mrr >= 0
                      ? 'text-[var(--success-text)]'
                      : 'text-red-500'
                  }`}
                >
                  {retentionMetrics.new_mrr + retentionMetrics.expansion_mrr - retentionMetrics.churned_mrr - retentionMetrics.contraction_mrr >= 0 ? '+' : ''}
                  {formatCurrency(
                    retentionMetrics.new_mrr +
                      retentionMetrics.expansion_mrr -
                      retentionMetrics.churned_mrr -
                      retentionMetrics.contraction_mrr
                  )}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Loading fallback
function AnalyticsSkeleton() {
  return (
    <div className="flex items-center justify-center h-full min-h-screen">
      <LoadingOverlay message="Loading analytics" showProgress={true} />
    </div>
  )
}

export default function AnalyticsPage() {
  return (
    <Suspense fallback={<AnalyticsSkeleton />}>
      <AnalyticsContent />
    </Suspense>
  )
}
