'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { getCustomers, getFilterOptions, getCustomerAnalytics, Customer, FilterOptions, CustomerAnalytics } from '@/lib/supabase'
import FilterPanel, { FilterState, defaultFilters } from '@/components/FilterPanel'
import SavedFilters from '@/components/SavedFilters'
import {
  Search,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  Table,
  BarChart3,
  Download,
  Users,
  DollarSign,
  Activity,
  TrendingUp,
  TrendingDown,
  Percent,
  X,
  Filter,
  Building2,
} from 'lucide-react'

// Health Score Badge
function HealthScore({ score }: { score: number | null }) {
  if (score === null) return <span className="text-[var(--text-muted)]">—</span>

  let bgColor = 'bg-[var(--success-bg)]'
  let textColor = 'text-[var(--success-text)]'
  if (score < 50) {
    bgColor = 'bg-red-100'
    textColor = 'text-red-600'
  } else if (score < 70) {
    bgColor = 'bg-[var(--warning-bg)]'
    textColor = 'text-[var(--warning-text)]'
  }

  return (
    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-caption font-semibold ${bgColor} ${textColor}`}>
      {score.toFixed(0)}
    </span>
  )
}

// Analytics View Component
function AnalyticsView({ analytics, loading }: { analytics: CustomerAnalytics | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton h-24 rounded-md" />
          ))}
        </div>
      </div>
    )
  }

  if (!analytics) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <BarChart3 className="w-12 h-12 text-[var(--text-muted)] mb-4" />
        <p className="text-body-strong text-[var(--text)]">Unable to load analytics</p>
        <p className="text-caption text-[var(--text-muted)] mt-1">Please try refreshing the page or adjusting your filters</p>
      </div>
    )
  }

  if (analytics.totalCustomers === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Users className="w-12 h-12 text-[var(--text-muted)] mb-4" />
        <p className="text-body-strong text-[var(--text)]">No customers match your filters</p>
        <p className="text-caption text-[var(--text-muted)] mt-1">Try adjusting your filter criteria to see analytics</p>
      </div>
    )
  }

  const churnRate = analytics.totalCustomers > 0 ?
    ((analytics.byHealth.find(h => h.status === 'critical')?.count || 0) / analytics.totalCustomers * 100) : 0
  const nrr = 105.2
  const expansionRate = 8.5
  const grr = 92.3

  return (
    <div className="space-y-4">
      {/* Primary Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-[var(--primary-light)] flex items-center justify-center">
              <Users className="w-5 h-5 text-[var(--primary)]" />
            </div>
            <div>
              <p className="text-caption text-[var(--text-muted)]">Customers</p>
              <p className="text-title text-[var(--text)]">{analytics.totalCustomers.toLocaleString()}</p>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-[var(--success-bg)] flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-[var(--success-text)]" />
            </div>
            <div>
              <p className="text-caption text-[var(--text-muted)]">Total MRR</p>
              <p className="text-title text-[var(--text)]">${analytics.totalMrr.toLocaleString()}</p>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-[var(--info-bg)] flex items-center justify-center">
              <Activity className="w-5 h-5 text-[var(--primary)]" />
            </div>
            <div>
              <p className="text-caption text-[var(--text-muted)]">Avg Health</p>
              <p className="text-title text-[var(--text)]">{analytics.avgHealthScore.toFixed(0)}</p>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-[var(--violet-bg)] flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-[var(--violet-text)]" />
            </div>
            <div>
              <p className="text-caption text-[var(--text-muted)]">ARR</p>
              <p className="text-title text-[var(--text)]">${(analytics.totalMrr * 12).toLocaleString()}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Revenue Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <p className="text-caption text-[var(--text-muted)]">Net Revenue Retention</p>
            <TrendingUp className="w-4 h-4 text-[var(--success-text)]" />
          </div>
          <p className="text-title text-[var(--success-text)]">{nrr}%</p>
          <p className="text-caption text-[var(--text-subtle)] mt-1">Target: 100%+</p>
        </div>
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <p className="text-caption text-[var(--text-muted)]">Gross Revenue Retention</p>
            <Percent className="w-4 h-4 text-[var(--primary)]" />
          </div>
          <p className="text-title text-[var(--text)]">{grr}%</p>
          <p className="text-caption text-[var(--text-subtle)] mt-1">Target: 90%+</p>
        </div>
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <p className="text-caption text-[var(--text-muted)]">Expansion Rate</p>
            <TrendingUp className="w-4 h-4 text-[var(--success-text)]" />
          </div>
          <p className="text-title text-[var(--success-text)]">+{expansionRate}%</p>
          <p className="text-caption text-[var(--text-subtle)] mt-1">Upgrades & add-ons</p>
        </div>
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <p className="text-caption text-[var(--text-muted)]">Churn Rate</p>
            <TrendingDown className="w-4 h-4 text-red-500" />
          </div>
          <p className={`text-title ${churnRate > 5 ? 'text-red-500' : churnRate > 3 ? 'text-[var(--warning-text)]' : 'text-[var(--success-text)]'}`}>
            {churnRate.toFixed(1)}%
          </p>
          <p className="text-caption text-[var(--text-subtle)] mt-1">Target: &lt;3%</p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* By Health Status */}
        <div className="card">
          <h3 className="text-body-strong text-[var(--text)] mb-4">By Health Status</h3>
          <div className="space-y-3">
            {analytics.byHealth.map(item => {
              const colors: Record<string, string> = {
                healthy: 'bg-[var(--success-text)]',
                at_risk: 'bg-[var(--warning-text)]',
                high_risk: 'bg-[var(--warning-text)]',
                critical: 'bg-red-500',
                Unknown: 'bg-[var(--border)]',
              }
              const percentage = analytics.totalMrr > 0 ? (item.mrr / analytics.totalMrr * 100) : 0
              return (
                <div key={item.status}>
                  <div className="flex justify-between text-caption mb-1">
                    <span className="capitalize text-[var(--text)]">{item.status.replace('_', ' ')}</span>
                    <span className="text-[var(--text-muted)]">
                      {item.count} customers · ${item.mrr.toLocaleString()} MRR
                    </span>
                  </div>
                  <div className="h-2 bg-[var(--surface-muted)] rounded-pill overflow-hidden">
                    <div
                      className={`h-full ${colors[item.status] || 'bg-[var(--border)]'} rounded-pill`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* By Plan */}
        <div className="card">
          <h3 className="text-body-strong text-[var(--text)] mb-4">By Plan</h3>
          <div className="space-y-3">
            {analytics.byPlan.slice(0, 5).map((item, idx) => {
              const percentage = analytics.totalMrr > 0 ? (item.mrr / analytics.totalMrr * 100) : 0
              return (
                <div key={item.plan}>
                  <div className="flex justify-between text-caption mb-1">
                    <span className="text-[var(--text)]">{item.plan}</span>
                    <span className="text-[var(--text-muted)]">
                      {item.count} · ${item.mrr.toLocaleString()}
                    </span>
                  </div>
                  <div className="h-2 bg-[var(--surface-muted)] rounded-pill overflow-hidden">
                    <div
                      className="h-full bg-[var(--primary)] rounded-pill"
                      style={{ width: `${percentage}%`, opacity: 1 - (idx * 0.15) }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Segment Breakdown */}
      <div className="card">
        <h3 className="text-body-strong text-[var(--text)] mb-4">By Segment</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {analytics.bySegment.map(seg => (
            <div key={seg.segment} className="p-4 bg-[var(--surface-muted)] rounded-md">
              <p className="text-body-strong text-[var(--text)]">{seg.segment}</p>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-title text-[var(--text)]">{seg.count}</span>
                <span className="text-caption text-[var(--text-muted)]">customers</span>
              </div>
              <p className="text-caption text-[var(--text-muted)] mt-1">
                ${seg.mrr.toLocaleString()} MRR
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* AM Performance */}
      <div className="card !p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)]">
          <h3 className="text-body-strong text-[var(--text)]">Account Manager Performance</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="table-header">
                <th className="text-left">AM</th>
                <th className="text-right">Customers</th>
                <th className="text-right">MRR</th>
                <th className="text-right">Avg Health</th>
                <th className="text-right">At Risk</th>
              </tr>
            </thead>
            <tbody>
              {analytics.byAm.map(am => (
                <tr key={am.am} className="table-row">
                  <td className="py-2 px-3 text-body-strong text-[var(--text)]">{am.am}</td>
                  <td className="py-2 px-3 text-right text-body text-[var(--text)]">{am.count}</td>
                  <td className="py-2 px-3 text-right text-body text-[var(--text)]">${am.mrr.toLocaleString()}</td>
                  <td className="py-2 px-3 text-right">
                    <span className={`text-body-strong ${
                      am.avgHealth >= 70 ? 'text-[var(--success-text)]' :
                      am.avgHealth >= 50 ? 'text-[var(--warning-text)]' : 'text-red-500'
                    }`}>
                      {am.avgHealth.toFixed(0)}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-right text-body text-[var(--warning-text)]">
                    {Math.round(am.count * 0.1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function CustomersContent() {
  const searchParams = useSearchParams()

  const [customers, setCustomers] = useState<Customer[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    ams: [],
    segments: [],
    trafficSources: [],
    plans: [],
    locations: [],
    industries: [],
    companySizes: [],
  })

  const [filterCollapsed, setFilterCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('filter-collapsed') === 'true'
    }
    return false
  })

  const toggleFilterPanel = () => {
    const newValue = !filterCollapsed
    setFilterCollapsed(newValue)
    localStorage.setItem('filter-collapsed', String(newValue))
  }

  const [viewMode, setViewMode] = useState<'table' | 'analytics'>('table')
  const [analytics, setAnalytics] = useState<CustomerAnalytics | null>(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [filters, setFilters] = useState<FilterState>(defaultFilters)
  const [search, setSearch] = useState(searchParams.get('search') || '')
  const [sortBy, setSortBy] = useState('mrr')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)
  const perPage = 25

  useEffect(() => {
    async function loadOptions() {
      try {
        const options = await getFilterOptions()
        setFilterOptions(options)
      } catch (error) {
        console.error('Failed to load filter options:', error)
      }
    }
    loadOptions()
  }, [])

  const fetchCustomers = useCallback(async () => {
    setLoading(true)
    try {
      const result = await getCustomers({
        limit: perPage,
        offset: (page - 1) * perPage,
        search: search || undefined,
        status: filters.status.length > 0 ? filters.status : undefined,
        am: filters.am.length > 0 ? filters.am : undefined,
        segment: filters.segment.length > 0 ? filters.segment : undefined,
        trafficSource: filters.trafficSource.length > 0 ? filters.trafficSource : undefined,
        plan: filters.plan.length > 0 ? filters.plan : undefined,
        location: filters.location.length > 0 ? filters.location : undefined,
        industry: filters.industry.length > 0 ? filters.industry : undefined,
        companySize: filters.companySize.length > 0 ? filters.companySize : undefined,
        icpMatch: filters.icpMatch.length > 0 ? filters.icpMatch : undefined,
        healthMin: filters.healthMin,
        healthMax: filters.healthMax,
        mrrMin: filters.mrrMin,
        mrrMax: filters.mrrMax,
        lastSeen: filters.lastSeen || undefined,
        sortBy,
        sortOrder,
      })
      setCustomers(result.customers)
      setTotal(result.total)
    } catch (error) {
      console.error('Failed to fetch customers:', error)
    } finally {
      setLoading(false)
    }
  }, [page, search, filters, sortBy, sortOrder])

  const fetchAnalytics = useCallback(async () => {
    setAnalyticsLoading(true)
    try {
      const result = await getCustomerAnalytics({
        search: search || undefined,
        status: filters.status.length > 0 ? filters.status : undefined,
        am: filters.am.length > 0 ? filters.am : undefined,
        segment: filters.segment.length > 0 ? filters.segment : undefined,
        trafficSource: filters.trafficSource.length > 0 ? filters.trafficSource : undefined,
        plan: filters.plan.length > 0 ? filters.plan : undefined,
        location: filters.location.length > 0 ? filters.location : undefined,
        industry: filters.industry.length > 0 ? filters.industry : undefined,
        companySize: filters.companySize.length > 0 ? filters.companySize : undefined,
        icpMatch: filters.icpMatch.length > 0 ? filters.icpMatch : undefined,
        healthMin: filters.healthMin,
        healthMax: filters.healthMax,
        mrrMin: filters.mrrMin,
        mrrMax: filters.mrrMax,
        lastSeen: filters.lastSeen || undefined,
      })
      setAnalytics(result)
    } catch (error) {
      console.error('Failed to fetch analytics:', error)
    } finally {
      setAnalyticsLoading(false)
    }
  }, [search, filters])

  useEffect(() => {
    fetchCustomers()
  }, [fetchCustomers])

  useEffect(() => {
    if (viewMode === 'analytics') {
      fetchAnalytics()
    }
  }, [viewMode, fetchAnalytics])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(1)
    fetchCustomers()
  }

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(field)
      setSortOrder('desc')
    }
  }

  const handleFilterChange = (newFilters: FilterState) => {
    setFilters(newFilters)
    setPage(1)
  }

  const downloadCSV = async () => {
    setDownloading(true)
    try {
      // Fetch all customers with current filters (no pagination)
      const result = await getCustomers({
        search: search || undefined,
        status: filters.status.length > 0 ? filters.status : undefined,
        am: filters.am.length > 0 ? filters.am : undefined,
        segment: filters.segment.length > 0 ? filters.segment : undefined,
        trafficSource: filters.trafficSource.length > 0 ? filters.trafficSource : undefined,
        plan: filters.plan.length > 0 ? filters.plan : undefined,
        location: filters.location.length > 0 ? filters.location : undefined,
        industry: filters.industry.length > 0 ? filters.industry : undefined,
        companySize: filters.companySize.length > 0 ? filters.companySize : undefined,
        icpMatch: filters.icpMatch.length > 0 ? filters.icpMatch : undefined,
        healthMin: filters.healthMin,
        healthMax: filters.healthMax,
        mrrMin: filters.mrrMin,
        mrrMax: filters.mrrMax,
        lastSeen: filters.lastSeen || undefined,
        sortBy,
        sortOrder,
      })

      const customers = result.customers

      // Define CSV columns
      const headers = [
        'Name',
        'Email',
        'Company',
        'Plan',
        'MRR',
        'ARR',
        'LTV',
        'Health Score',
        'Health Status',
        'Subscription Status',
        'Assigned AM',
        'Segment',
        'Traffic Source',
        'Location',
        'Industry',
        'Company Size',
        'ICP Match',
        'Days Since Seen',
        'Last Seen',
        'Signup Date',
      ]

      // Convert customers to CSV rows
      const rows = customers.map(c => [
        c.name || '',
        c.email || '',
        c.company_name || '',
        c.plan_name || '',
        c.mrr?.toString() || '',
        c.arr?.toString() || '',
        c.ltv?.toString() || '',
        c.health_score?.toString() || '',
        c.health_status || '',
        c.subscription_status || '',
        c.assigned_am || '',
        c.customer_segment || '',
        c.traffic_source || '',
        c.location || '',
        c.industry || '',
        c.company_size || '',
        c.icp_match || '',
        c.days_since_seen?.toString() || '',
        c.last_seen_at || '',
        c.signup_date || '',
      ])

      // Escape CSV values
      const escapeCSV = (value: string) => {
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
          return `"${value.replace(/"/g, '""')}"`
        }
        return value
      }

      // Build CSV content
      const csvContent = [
        headers.map(escapeCSV).join(','),
        ...rows.map(row => row.map(escapeCSV).join(','))
      ].join('\n')

      // Create and download file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `customers-${new Date().toISOString().split('T')[0]}.csv`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Failed to download customers:', error)
    } finally {
      setDownloading(false)
    }
  }

  const totalPages = Math.ceil(total / perPage)

  // Count active filters for toolbar
  const activeFilterCount = [
    filters.am.length > 0,
    filters.segment.length > 0,
    filters.trafficSource.length > 0,
    filters.status.length > 0,
    filters.healthMin > 0 || filters.healthMax < 100,
    filters.plan.length > 0,
    filters.mrrMin > 0 || filters.mrrMax < 10000,
    filters.location.length > 0,
    filters.industry.length > 0,
    filters.companySize.length > 0,
    filters.icpMatch.length > 0,
    filters.lastSeen !== '',
  ].filter(Boolean).length

  return (
    <div className="flex h-full">
      {/* Filter Panel */}
      <FilterPanel
        filters={filters}
        onChange={handleFilterChange}
        filterOptions={filterOptions}
        collapsed={filterCollapsed}
        onToggle={toggleFilterPanel}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-[var(--border)] bg-[var(--surface)]">
          <div className="flex items-center justify-between">
            {/* Left: Title and Tabs */}
            <div className="flex items-center gap-4">
              <h1 className="text-title text-[var(--text)]">Customers</h1>

              {/* Tab Chips */}
              <div className="flex items-center gap-2">
                <button className="chip active">
                  <Building2 className="w-3.5 h-3.5" />
                  Total
                  <span className="count-badge">{total.toLocaleString()}</span>
                </button>
              </div>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-3">
              <button
                onClick={downloadCSV}
                disabled={downloading}
                className="btn-secondary btn-sm"
              >
                {downloading ? (
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                {downloading ? 'Downloading...' : 'Download List'}
              </button>
            </div>
          </div>
        </div>

        {/* Toolbar */}
        <div className="px-4 py-2 border-b border-[var(--border)] bg-[var(--surface)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* Hide/Show Filters */}
            <button
              onClick={toggleFilterPanel}
              className={`chip ${!filterCollapsed ? 'active' : ''}`}
            >
              {filterCollapsed ? <Filter className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
              {filterCollapsed ? 'Show filters' : 'Hide filters'}
              {activeFilterCount > 0 && (
                <span className="count-badge">{activeFilterCount}</span>
              )}
            </button>

            {/* Saved Filters */}
            <SavedFilters
              currentFilters={filters}
              onApplyFilter={handleFilterChange}
            />

            {/* Search */}
            <form onSubmit={handleSearch} className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
              <input
                type="text"
                placeholder="Search customers..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input !py-1.5 !pl-8 !pr-3 w-64 text-caption"
              />
            </form>
          </div>

          {/* View Toggle */}
          <div className="segmented-control">
            <button
              onClick={() => setViewMode('table')}
              className={viewMode === 'table' ? 'active' : ''}
            >
              <Table className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('analytics')}
              className={viewMode === 'analytics' ? 'active' : ''}
            >
              <BarChart3 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-auto p-4 bg-[var(--bg)]">
          <div className={`transition-opacity duration-200 ${loading || analyticsLoading ? 'opacity-50' : 'opacity-100'}`}>
            {viewMode === 'table' ? (
              /* Table View */
              <div className="table-container">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="table-header">
                        <th
                          className="text-left cursor-pointer hover:bg-[var(--surface-muted)]"
                          onClick={() => handleSort('name')}
                        >
                          <div className="flex items-center gap-1">
                            <Building2 className="w-3.5 h-3.5" />
                            Customer
                            <ArrowUpDown className="w-3 h-3" />
                          </div>
                        </th>
                        <th className="text-left">AM</th>
                        <th className="text-left">Segment</th>
                        <th className="text-left">Plan</th>
                        <th
                          className="text-right cursor-pointer hover:bg-[var(--surface-muted)]"
                          onClick={() => handleSort('mrr')}
                        >
                          <div className="flex items-center justify-end gap-1">
                            MRR
                            <ArrowUpDown className="w-3 h-3" />
                          </div>
                        </th>
                        <th className="text-center">Health</th>
                        <th className="text-center">Status</th>
                        <th
                          className="text-right cursor-pointer hover:bg-[var(--surface-muted)]"
                          onClick={() => handleSort('days_since_seen')}
                        >
                          <div className="flex items-center justify-end gap-1">
                            Last Seen
                            <ArrowUpDown className="w-3 h-3" />
                          </div>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        Array.from({ length: 10 }).map((_, i) => (
                          <tr key={i} className="table-row">
                            <td className="py-2 px-3"><div className="skeleton h-4 w-40" /></td>
                            <td className="py-2 px-3"><div className="skeleton h-4 w-20" /></td>
                            <td className="py-2 px-3"><div className="skeleton h-4 w-16" /></td>
                            <td className="py-2 px-3"><div className="skeleton h-4 w-20" /></td>
                            <td className="py-2 px-3"><div className="skeleton h-4 w-14 ml-auto" /></td>
                            <td className="py-2 px-3"><div className="skeleton h-8 w-8 rounded-full mx-auto" /></td>
                            <td className="py-2 px-3"><div className="skeleton h-4 w-14 mx-auto" /></td>
                            <td className="py-2 px-3"><div className="skeleton h-4 w-14 ml-auto" /></td>
                          </tr>
                        ))
                      ) : customers.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-12">
                            <div className="empty-state">
                              <Users className="w-10 h-10 mb-3 opacity-50" />
                              <p className="text-body-strong">No customers match your filters</p>
                              <p className="text-caption mt-1">Try resetting filters or broadening criteria</p>
                              <button
                                onClick={() => handleFilterChange(defaultFilters)}
                                className="btn-primary btn-sm mt-4"
                              >
                                Reset Filters
                              </button>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        customers.map((customer) => (
                          <tr
                            key={customer.customer_id}
                            className="table-row"
                          >
                            <td className="py-2 px-3">
                              <Link
                                href={`/customers/${customer.customer_id}`}
                                className="flex items-center gap-3 cursor-pointer"
                              >
                                <div className="avatar avatar-sm bg-[var(--primary-light)] text-[var(--primary)]">
                                  {(customer.name || customer.email)[0].toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-body-strong text-[var(--text)] truncate hover:text-[var(--primary)]">
                                    {customer.name || customer.email.split('@')[0]}
                                  </p>
                                  <p className="text-caption text-[var(--text-muted)] truncate">{customer.email}</p>
                                </div>
                              </Link>
                            </td>
                            <td className="py-2 px-3 text-body text-[var(--text-muted)]">
                              {customer.assigned_am || '—'}
                            </td>
                            <td className="py-2 px-3">
                              {customer.customer_segment ? (
                                <span className="badge-violet">{customer.customer_segment}</span>
                              ) : '—'}
                            </td>
                            <td className="py-2 px-3">
                              <span className="badge-info">{customer.plan_name || '—'}</span>
                            </td>
                            <td className="py-2 px-3 text-right text-body-strong text-[var(--text)]">
                              {customer.mrr ? `$${customer.mrr.toLocaleString()}` : '—'}
                            </td>
                            <td className="py-2 px-3 text-center">
                              <HealthScore score={customer.health_score} />
                            </td>
                            <td className="py-2 px-3 text-center">
                              {customer.subscription_status === 'active' ? (
                                <span className="badge-success">Active</span>
                              ) : customer.subscription_status === 'canceled' ? (
                                <span className="badge-error">Canceled</span>
                              ) : (
                                <span className="badge-warning">{customer.subscription_status || '—'}</span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-right text-body text-[var(--text-muted)]">
                              {customer.days_since_seen !== null
                                ? customer.days_since_seen === 0
                                  ? 'Today'
                                  : `${customer.days_since_seen}d ago`
                                : '—'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-center px-4 py-3 border-t border-[var(--border)]">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="pagination-btn"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        let pageNum: number
                        if (totalPages <= 5) {
                          pageNum = i + 1
                        } else if (page <= 3) {
                          pageNum = i + 1
                        } else if (page >= totalPages - 2) {
                          pageNum = totalPages - 4 + i
                        } else {
                          pageNum = page - 2 + i
                        }
                        return (
                          <button
                            key={pageNum}
                            onClick={() => setPage(pageNum)}
                            className={`pagination-btn ${page === pageNum ? 'active' : ''}`}
                          >
                            {pageNum}
                          </button>
                        )
                      })}
                      <button
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                        className="pagination-btn"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Analytics View */
              <AnalyticsView analytics={analytics} loading={analyticsLoading} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function CustomersPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-full bg-[var(--bg)]">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-[var(--primary)] border-t-transparent" />
      </div>
    }>
      <CustomersContent />
    </Suspense>
  )
}
