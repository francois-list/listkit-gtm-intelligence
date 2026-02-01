import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Lazy initialization to avoid issues during build
let supabaseInstance: SupabaseClient | null = null

function getSupabaseClient(): SupabaseClient {
  if (!supabaseInstance) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

    if (!supabaseUrl || !supabaseAnonKey) {
      console.warn('Supabase environment variables not configured')
    }

    supabaseInstance = createClient(supabaseUrl, supabaseAnonKey)
  }
  return supabaseInstance
}

// Export a proxy that lazily initializes the client
export const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    const client = getSupabaseClient()
    const value = (client as any)[prop]
    if (typeof value === 'function') {
      return value.bind(client)
    }
    return value
  }
})

// Types for our database

// Fathom call data stored in custom_attributes
export interface FathomCall {
  call_id: string | null
  title: string | null
  date: string | null
  duration_minutes: number | null
  url: string | null
  share_url: string | null
  recorded_by: string | null
}

// Calendly event data stored in custom_attributes
export interface CalendlyEvent {
  event_id: string | null
  event_type: string | null
  event_name: string | null
  start_time: string | null
  end_time: string | null
  status: string | null
  location: string | null
  cancellation_reason: string | null
  rescheduled: boolean | null
  no_show: boolean | null
  invitee_name: string | null
  invitee_email: string | null
  organizer: string | null  // Host name (ListKit team member)
}

// Calendly questionnaire response
export interface CalendlyQuestionnaireResponse {
  question: string
  answer: string
  event_name?: string
  event_date?: string
}

// Intercom conversation data stored in custom_attributes
export interface IntercomConversation {
  conversation_id: string
  subject: string | null
  preview: string | null
  source_type: string | null  // email, chat, etc.
  delivered_as: string | null
  state: string | null  // open, closed, snoozed
  priority: string | null
  created_at: number | null  // Unix timestamp
  updated_at: number | null
  waiting_since: number | null
  read: boolean
  author_name: string | null
  author_email: string | null
  author_type: string | null  // user, lead, admin
  intercom_url: string
  tags: string[]
  parts_count: number
}

// Custom attributes JSON structure from database
export interface CustomerCustomAttributes {
  // Fathom data
  fathom_calls_count?: number
  fathom_total_duration_minutes?: number
  fathom_last_call_date?: string
  fathom_last_call_title?: string
  fathom_last_recorded_by?: string
  fathom_recent_calls?: FathomCall[]
  // Calendly data
  calendly_events_count?: number
  calendly_completed_events?: number
  calendly_no_shows?: number
  calendly_show_rate?: number
  calendly_last_event_date?: string
  calendly_last_event_type?: string
  calendly_events?: CalendlyEvent[]
  // Calendly questionnaire data
  calendly_questionnaire?: CalendlyQuestionnaireResponse[]
  growth_goals?: string
  leads_per_month?: string
  email_tool?: string
  phone_from_calendly?: string
  // Intercom data
  intercom_conversations?: IntercomConversation[]
  intercom_conversations_count?: number
  intercom_open_count?: number
  intercom_last_conversation_date?: number
}

export interface Customer {
  customer_id: string
  email: string
  name: string | null
  company_name: string | null
  mrr: number | null
  arr: number | null
  ltv: number | null
  plan_name: string | null
  subscription_status: string | null
  health_score: number | null
  health_status: string | null
  churn_risk: number | null
  days_since_seen: number | null
  last_seen_at: string | null
  signup_date: string | null
  assigned_am: string | null
  intercom_contact_id: string | null
  stripe_customer_id: string | null
  intercom_convos_total: number | null
  intercom_convos_30d: number | null
  open_tickets: number | null
  mentioned_cancel: boolean | null
  is_delinquent: boolean | null
  traffic_source: string | null
  industry: string | null
  mrr_tier: string | null
  tenure_segment: string | null
  customer_segment: string | null
  location: string | null
  location_city: string | null
  location_country: string | null
  company_size: string | null
  icp_match: string | null
  // About Client Business - populated from Fathom, Calendly, onboarding
  client_offer: string | null
  client_icp: string | null
  client_ltv: number | null
  // Custom attributes JSON containing Fathom and Calendly data
  custom_attributes: CustomerCustomAttributes | null
}

export interface Campaign {
  id: string
  customer_id: string | null
  smartlead_campaign_id: string | null
  smartlead_client_id: number | null  // SmartLead client ID that owns this campaign
  smartlead_client_email: string | null  // Email of the SmartLead client
  campaign_name: string
  status: string | null  // 'active' | 'paused' | 'completed' | 'draft'
  leads_count: number
  emails_sent: number
  reply_count: number
  positive_reply_count: number
  bounce_count: number
  reply_rate: number | null
  positive_reply_rate: number | null
  bounce_rate: number | null
  created_at: string
  updated_at: string
  last_synced_at: string | null
}

export interface DashboardStats {
  totalCustomers: number
  payingCustomers: number
  totalMrr: number
  totalArr: number
  healthyCount: number
  atRiskCount: number
  criticalCount: number
  avgHealthScore: number
}

export interface FilterOptions {
  ams: string[]
  segments: string[]
  trafficSources: string[]
  plans: string[]
  locations: string[]
  industries: string[]
  companySizes: string[]
}

// Fetch available filter options from database
export async function getFilterOptions(): Promise<FilterOptions> {
  const [amsResult, segmentsResult, trafficResult, plansResult, locationsResult, industriesResult, sizesResult] = await Promise.all([
    supabase.from('unified_customers').select('assigned_am').not('assigned_am', 'is', null),
    supabase.from('unified_customers').select('customer_segment').not('customer_segment', 'is', null),
    supabase.from('unified_customers').select('traffic_source').not('traffic_source', 'is', null),
    supabase.from('unified_customers').select('plan_name').not('plan_name', 'is', null),
    supabase.from('unified_customers').select('location').not('location', 'is', null),
    supabase.from('unified_customers').select('industry').not('industry', 'is', null),
    supabase.from('unified_customers').select('company_size').not('company_size', 'is', null),
  ])

  const unique = (arr: any[], key: string) => [...new Set(arr?.map(item => item[key]).filter(Boolean))]

  return {
    ams: unique(amsResult.data || [], 'assigned_am').sort(),
    segments: unique(segmentsResult.data || [], 'customer_segment').sort(),
    trafficSources: unique(trafficResult.data || [], 'traffic_source').sort(),
    plans: unique(plansResult.data || [], 'plan_name').sort(),
    locations: unique(locationsResult.data || [], 'location').sort(),
    industries: unique(industriesResult.data || [], 'industry').sort(),
    companySizes: unique(sizesResult.data || [], 'company_size').sort(),
  }
}

// Dashboard queries
export async function getDashboardStats(): Promise<DashboardStats> {
  // Run all queries in parallel for faster loading
  const [
    totalCustomersResult,
    payingCustomersResult,
    mrrResult,
    healthResult,
    avgHealthResult,
  ] = await Promise.all([
    // Total customers
    supabase
      .from('unified_customers')
      .select('*', { count: 'exact', head: true }),
    // Paying customers
    supabase
      .from('unified_customers')
      .select('*', { count: 'exact', head: true })
      .gt('mrr', 0),
    // MRR sum
    supabase
      .from('unified_customers')
      .select('mrr')
      .eq('subscription_status', 'active')
      .gt('mrr', 0),
    // Health distribution
    supabase
      .from('unified_customers')
      .select('health_status')
      .gt('mrr', 0),
    // Average health score
    supabase
      .from('unified_customers')
      .select('health_score')
      .gt('mrr', 0)
      .not('health_score', 'is', null),
  ])

  const totalCustomers = totalCustomersResult.count || 0
  const payingCustomers = payingCustomersResult.count || 0
  const mrrData = mrrResult.data || []
  const healthData = healthResult.data || []
  const avgData = avgHealthResult.data || []

  const totalMrr = mrrData.reduce((sum, c) => sum + (c.mrr || 0), 0)
  const healthyCount = healthData.filter(c => c.health_status === 'healthy').length
  const atRiskCount = healthData.filter(c => ['at_risk', 'high_risk'].includes(c.health_status || '')).length
  const criticalCount = healthData.filter(c => c.health_status === 'critical').length
  const avgHealthScore = avgData.length
    ? avgData.reduce((sum, c) => sum + (c.health_score || 0), 0) / avgData.length
    : 0

  return {
    totalCustomers,
    payingCustomers,
    totalMrr,
    totalArr: totalMrr * 12,
    healthyCount,
    atRiskCount,
    criticalCount,
    avgHealthScore,
  }
}

export async function getTopCustomers(limit: number = 10): Promise<Customer[]> {
  const { data, error } = await supabase
    .from('unified_customers')
    .select('*')
    .gt('mrr', 0)
    .order('mrr', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data || []
}

export interface CustomerFilters {
  limit?: number
  offset?: number
  search?: string
  status?: string[]
  healthStatus?: string[]
  am?: string[]
  segment?: string[]
  trafficSource?: string[]
  plan?: string[]
  location?: string[]
  industry?: string[]
  companySize?: string[]
  icpMatch?: string[]
  healthMin?: number
  healthMax?: number
  mrrMin?: number
  mrrMax?: number
  lastSeen?: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

export async function getCustomers(options: CustomerFilters): Promise<{ customers: Customer[]; total: number }> {
  let query = supabase.from('unified_customers').select('*', { count: 'exact' })

  // Search
  if (options.search) {
    query = query.or(`email.ilike.%${options.search}%,name.ilike.%${options.search}%,company_name.ilike.%${options.search}%`)
  }

  // Status filter
  if (options.status && options.status.length > 0) {
    const statusValues = options.status.map(s => s.toLowerCase().replace(' ', '_'))
    query = query.in('subscription_status', statusValues)
  }

  // Health status filter
  if (options.healthStatus && options.healthStatus.length > 0) {
    query = query.in('health_status', options.healthStatus.map(h => h.toLowerCase()))
  }

  // AM filter
  if (options.am && options.am.length > 0) {
    query = query.in('assigned_am', options.am)
  }

  // Segment filter
  if (options.segment && options.segment.length > 0) {
    query = query.in('customer_segment', options.segment)
  }

  // Traffic source filter
  if (options.trafficSource && options.trafficSource.length > 0) {
    query = query.in('traffic_source', options.trafficSource)
  }

  // Plan filter
  if (options.plan && options.plan.length > 0) {
    query = query.in('plan_name', options.plan)
  }

  // Location filter
  if (options.location && options.location.length > 0) {
    query = query.in('location', options.location)
  }

  // Industry filter
  if (options.industry && options.industry.length > 0) {
    query = query.in('industry', options.industry)
  }

  // Company size filter
  if (options.companySize && options.companySize.length > 0) {
    query = query.in('company_size', options.companySize)
  }

  // ICP match filter
  if (options.icpMatch && options.icpMatch.length > 0) {
    query = query.in('icp_match', options.icpMatch)
  }

  // Health score range
  if (options.healthMin !== undefined && options.healthMin > 0) {
    query = query.gte('health_score', options.healthMin)
  }
  if (options.healthMax !== undefined && options.healthMax < 100) {
    query = query.lte('health_score', options.healthMax)
  }

  // MRR range
  if (options.mrrMin !== undefined && options.mrrMin > 0) {
    query = query.gte('mrr', options.mrrMin)
  }
  if (options.mrrMax !== undefined && options.mrrMax < 10000) {
    query = query.lte('mrr', options.mrrMax)
  }

  // Last seen filter
  if (options.lastSeen) {
    let daysAgo: number | null = null

    switch (options.lastSeen) {
      case 'today':
        daysAgo = 0
        break
      case '7days':
        daysAgo = 7
        break
      case '30days':
        daysAgo = 30
        break
      case '90days':
        daysAgo = 90
        break
      case 'inactive':
        query = query.gt('days_since_seen', 90)
        break
    }

    if (daysAgo !== null) {
      query = query.lte('days_since_seen', daysAgo)
    }
  }

  // Sorting
  const sortBy = options.sortBy || 'mrr'
  const sortOrder = options.sortOrder === 'asc' ? true : false
  query = query.order(sortBy, { ascending: sortOrder, nullsFirst: false })

  // Pagination
  if (options.limit !== undefined && options.offset !== undefined) {
    // Use range for pagination (Supabase defaults to 1000 row limit without explicit range)
    query = query.range(options.offset, options.offset + options.limit - 1)
  } else if (options.limit) {
    query = query.limit(options.limit)
  }

  const { data, count, error } = await query

  if (error) throw error
  return { customers: data || [], total: count || 0 }
}

export async function getCustomerById(id: string): Promise<Customer | null> {
  const { data, error } = await supabase
    .from('unified_customers')
    .select('*')
    .eq('customer_id', id)
    .single()

  if (error) return null
  return data
}

export async function getCustomerByEmail(email: string): Promise<Customer | null> {
  const { data, error } = await supabase
    .from('unified_customers')
    .select('*')
    .eq('email', email.toLowerCase())
    .single()

  if (error) return null
  return data
}

export async function getCampaignsForCustomer(customerId: string): Promise<Campaign[]> {
  const { data, error } = await supabase
    .from('campaigns')
    .select('*')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching campaigns:', error)
    return []
  }
  return data || []
}

export async function getMrrByPlan(): Promise<{ plan: string; mrr: number; count: number }[]> {
  const { data, error } = await supabase
    .from('unified_customers')
    .select('plan_name, mrr')
    .eq('subscription_status', 'active')
    .gt('mrr', 0)

  if (error) throw error

  // Group by plan
  const grouped = (data || []).reduce((acc, c) => {
    const plan = c.plan_name || 'Unknown'
    if (!acc[plan]) {
      acc[plan] = { mrr: 0, count: 0 }
    }
    acc[plan].mrr += c.mrr || 0
    acc[plan].count += 1
    return acc
  }, {} as Record<string, { mrr: number; count: number }>)

  return Object.entries(grouped)
    .map(([plan, data]) => ({ plan, ...data }))
    .sort((a, b) => b.mrr - a.mrr)
}

// Analytics aggregations
export interface CustomerAnalytics {
  totalCustomers: number
  totalMrr: number
  avgHealthScore: number
  bySegment: { segment: string; count: number; mrr: number }[]
  byHealth: { status: string; count: number; mrr: number }[]
  byAm: { am: string; count: number; mrr: number; avgHealth: number }[]
  byPlan: { plan: string; count: number; mrr: number }[]
}

export async function getCustomerAnalytics(filters: CustomerFilters): Promise<CustomerAnalytics> {
  try {
    // Supabase has a default 1000 row limit, so we need to batch fetch all customers
    // First, get the total count and first batch
    const BATCH_SIZE = 1000
    const { customers: firstBatch, total } = await getCustomers({
      ...filters,
      limit: BATCH_SIZE,
      offset: 0,
    })

    let allCustomers = [...firstBatch]

    // Fetch remaining batches if needed
    if (total > BATCH_SIZE) {
      const remainingBatches = Math.ceil((total - BATCH_SIZE) / BATCH_SIZE)
      const batchPromises = []

      for (let i = 1; i <= remainingBatches; i++) {
        batchPromises.push(
          getCustomers({
            ...filters,
            limit: BATCH_SIZE,
            offset: i * BATCH_SIZE,
          })
        )
      }

      const batchResults = await Promise.all(batchPromises)
      for (const result of batchResults) {
        allCustomers = allCustomers.concat(result.customers)
      }
    }

    const customers = allCustomers

    const totalCustomers = customers.length
  const totalMrr = customers.reduce((sum, c) => sum + (c.mrr || 0), 0)
  const validHealthScores = customers.filter(c => c.health_score !== null)
  const avgHealthScore = validHealthScores.length
    ? validHealthScores.reduce((sum, c) => sum + (c.health_score || 0), 0) / validHealthScores.length
    : 0

  // Group by segment
  const segmentMap = new Map<string, { count: number; mrr: number }>()
  customers.forEach(c => {
    const segment = c.customer_segment || 'Unknown'
    const existing = segmentMap.get(segment) || { count: 0, mrr: 0 }
    segmentMap.set(segment, {
      count: existing.count + 1,
      mrr: existing.mrr + (c.mrr || 0),
    })
  })
  const bySegment = Array.from(segmentMap.entries())
    .map(([segment, data]) => ({ segment, ...data }))
    .sort((a, b) => b.mrr - a.mrr)

  // Group by health status
  const healthMap = new Map<string, { count: number; mrr: number }>()
  customers.forEach(c => {
    const status = c.health_status || 'Unknown'
    const existing = healthMap.get(status) || { count: 0, mrr: 0 }
    healthMap.set(status, {
      count: existing.count + 1,
      mrr: existing.mrr + (c.mrr || 0),
    })
  })
  const byHealth = Array.from(healthMap.entries())
    .map(([status, data]) => ({ status, ...data }))

  // Group by AM
  const amMap = new Map<string, { count: number; mrr: number; healthSum: number; healthCount: number }>()
  customers.forEach(c => {
    const am = c.assigned_am || 'Unassigned'
    const existing = amMap.get(am) || { count: 0, mrr: 0, healthSum: 0, healthCount: 0 }
    amMap.set(am, {
      count: existing.count + 1,
      mrr: existing.mrr + (c.mrr || 0),
      healthSum: existing.healthSum + (c.health_score || 0),
      healthCount: existing.healthCount + (c.health_score !== null ? 1 : 0),
    })
  })
  const byAm = Array.from(amMap.entries())
    .map(([am, data]) => ({
      am,
      count: data.count,
      mrr: data.mrr,
      avgHealth: data.healthCount > 0 ? data.healthSum / data.healthCount : 0,
    }))
    .sort((a, b) => b.mrr - a.mrr)

  // Group by plan
  const planMap = new Map<string, { count: number; mrr: number }>()
  customers.forEach(c => {
    const plan = c.plan_name || 'Unknown'
    const existing = planMap.get(plan) || { count: 0, mrr: 0 }
    planMap.set(plan, {
      count: existing.count + 1,
      mrr: existing.mrr + (c.mrr || 0),
    })
  })
  const byPlan = Array.from(planMap.entries())
    .map(([plan, data]) => ({ plan, ...data }))
    .sort((a, b) => b.mrr - a.mrr)

  return {
    totalCustomers,
    totalMrr,
    avgHealthScore,
    bySegment,
    byHealth,
    byAm,
    byPlan,
  }
  } catch (error) {
    console.error('Failed to fetch customer analytics:', error)
    // Re-throw to let the UI show "Unable to load analytics"
    throw error
  }
}

// Admin/debug function to get campaigns without customer linkage
export async function getUnlinkedCampaigns(): Promise<Campaign[]> {
  const { data, error } = await supabase
    .from('campaigns')
    .select('*')
    .is('customer_id', null)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching unlinked campaigns:', error)
    return []
  }
  return data || []
}

// MRR Snapshot type
export interface MrrSnapshot {
  id: string
  snapshot_date: string
  total_mrr: number
  total_arr: number
  total_customers: number
  paying_customers: number
  churned_mrr: number
  expansion_mrr: number
  contraction_mrr: number
  new_mrr: number
  nrr: number | null
  grr: number | null
  churn_rate: number | null
  revenue_churn_rate: number | null
  expansion_rate: number | null
  healthy_count: number
  at_risk_count: number
  critical_count: number
}

// Retention metrics type
export interface RetentionMetrics {
  nrr: number  // Net Revenue Retention %
  grr: number  // Gross Revenue Retention %
  churnRate: number  // Customer Churn Rate %
  revenueChurnRate: number  // Revenue Churn Rate %
  expansionRate: number  // Expansion Rate %
  churned_mrr: number
  expansion_mrr: number
  contraction_mrr: number
  new_mrr: number
}

// Get MRR history for chart
export async function getMrrHistory(months: number = 12): Promise<MrrSnapshot[]> {
  const { data, error } = await supabase
    .from('mrr_snapshots')
    .select('*')
    .order('snapshot_date', { ascending: true })
    .limit(months)

  if (error) {
    console.error('Error fetching MRR history:', error)
    return []
  }
  return data || []
}

// Get latest retention metrics
export async function getRetentionMetrics(): Promise<RetentionMetrics> {
  // Try to get the latest snapshot with retention metrics
  const { data: latestSnapshot, error } = await supabase
    .from('mrr_snapshots')
    .select('*')
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .single()

  if (error || !latestSnapshot) {
    // If no snapshots exist, calculate from current data estimates
    // These are placeholder calculations - real calculations need historical data
    const stats = await getDashboardStats()

    // Estimate retention metrics based on health distribution
    // Healthy customers have ~2% churn, at-risk ~15%, critical ~40%
    const totalPaying = stats.payingCustomers || 1
    const healthyPct = stats.healthyCount / totalPaying
    const atRiskPct = stats.atRiskCount / totalPaying
    const criticalPct = stats.criticalCount / totalPaying

    const estimatedChurnRate = (healthyPct * 2) + (atRiskPct * 15) + (criticalPct * 40)
    const estimatedGrr = Math.max(0, 100 - estimatedChurnRate)
    const estimatedExpansion = 5 // Default 5% expansion assumption
    const estimatedNrr = estimatedGrr + estimatedExpansion

    return {
      nrr: Math.round(estimatedNrr * 10) / 10,
      grr: Math.round(estimatedGrr * 10) / 10,
      churnRate: Math.round(estimatedChurnRate * 10) / 10,
      revenueChurnRate: Math.round(estimatedChurnRate * 10) / 10,
      expansionRate: estimatedExpansion,
      churned_mrr: 0,
      expansion_mrr: 0,
      contraction_mrr: 0,
      new_mrr: 0,
    }
  }

  return {
    nrr: latestSnapshot.nrr || 100,
    grr: latestSnapshot.grr || 100,
    churnRate: latestSnapshot.churn_rate || 0,
    revenueChurnRate: latestSnapshot.revenue_churn_rate || 0,
    expansionRate: latestSnapshot.expansion_rate || 0,
    churned_mrr: latestSnapshot.churned_mrr || 0,
    expansion_mrr: latestSnapshot.expansion_mrr || 0,
    contraction_mrr: latestSnapshot.contraction_mrr || 0,
    new_mrr: latestSnapshot.new_mrr || 0,
  }
}
