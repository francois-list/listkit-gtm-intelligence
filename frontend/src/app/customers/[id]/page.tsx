import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getCustomerById, getCampaignsForCustomer, FathomCall, CalendlyEvent } from '@/lib/supabase'
import {
  ArrowLeft,
  Mail,
  Building2,
  MapPin,
  Calendar,
  DollarSign,
  CreditCard,
  Activity,
  MessageSquare,
  Phone,
  Video,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  User,
  Users,
  ExternalLink,
  Briefcase,
  Target,
  TrendingUp,
  Send,
} from 'lucide-react'

// Health Score Ring
function HealthScoreRing({ score }: { score: number | null }) {
  if (score === null) {
    return (
      <div className="w-20 h-20 rounded-full border-4 border-[var(--border)] flex items-center justify-center">
        <span className="text-title text-[var(--text-muted)]">—</span>
      </div>
    )
  }

  let color = 'var(--success-text)'
  if (score < 50) color = '#EF4444'
  else if (score < 70) color = 'var(--warning-text)'

  const circumference = 2 * Math.PI * 36
  const offset = circumference - (score / 100) * circumference

  return (
    <div className="relative w-20 h-20">
      <svg className="w-20 h-20 -rotate-90">
        <circle
          cx="40"
          cy="40"
          r="36"
          stroke="var(--surface-muted)"
          strokeWidth="6"
          fill="none"
        />
        <circle
          cx="40"
          cy="40"
          r="36"
          stroke={color}
          strokeWidth="6"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-title" style={{ color }}>{score.toFixed(0)}</span>
      </div>
    </div>
  )
}

// Status Badge
function StatusBadge({ status, large }: { status: string | null; large?: boolean }) {
  if (!status) return null

  const styles: Record<string, { className: string; icon: React.ComponentType<{ className?: string }> }> = {
    active: { className: 'badge-success', icon: CheckCircle2 },
    trialing: { className: 'badge-info', icon: Clock },
    past_due: { className: 'badge-warning', icon: AlertTriangle },
    canceled: { className: 'badge-error', icon: XCircle },
    unpaid: { className: 'badge-error', icon: AlertTriangle },
  }

  const style = styles[status] || styles.active
  const Icon = style.icon

  return (
    <span className={`inline-flex items-center gap-1.5 ${style.className} ${large ? 'px-3 py-1' : ''}`}>
      <Icon className={large ? 'w-4 h-4' : 'w-3 h-3'} />
      {status.replace('_', ' ').charAt(0).toUpperCase() + status.slice(1).replace('_', ' ')}
    </span>
  )
}

// Health Status Badge
function HealthStatusBadge({ status }: { status: string | null }) {
  if (!status) return null

  const styles: Record<string, string> = {
    healthy: 'badge-success',
    at_risk: 'badge-warning',
    high_risk: 'badge-warning',
    critical: 'badge-error',
  }

  return (
    <span className={`${styles[status] || 'badge-info'} px-3 py-1`}>
      {status.replace('_', ' ').charAt(0).toUpperCase() + status.slice(1).replace('_', ' ')}
    </span>
  )
}

// Campaign Status Badge
function CampaignStatusBadge({ status }: { status: string | null }) {
  if (!status) return null

  const styles: Record<string, string> = {
    active: 'badge-success',
    paused: 'badge-warning',
    completed: 'badge-info',
    draft: 'pill',
  }

  return (
    <span className={styles[status] || 'pill'}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}

// Info Card
function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <h3 className="text-body-strong text-[var(--text)] mb-4">{title}</h3>
      {children}
    </div>
  )
}

// Info Row
function InfoRow({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string | number | null | undefined
  href?: string
}) {
  const content = (
    <div className="flex items-center gap-3 py-2">
      <Icon className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0" />
      <span className="text-caption text-[var(--text-muted)] flex-shrink-0 w-28">{label}</span>
      <span className="text-body text-[var(--text)] flex-1">{value || '—'}</span>
      {href && <ExternalLink className="w-4 h-4 text-[var(--text-muted)]" />}
    </div>
  )

  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="hover:bg-[var(--surface-muted)] -mx-2 px-2 rounded-sm transition-colors block">
        {content}
      </a>
    )
  }

  return content
}

export default async function CustomerDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const customer = await getCustomerById(params.id)
  const campaigns = await getCampaignsForCustomer(params.id)

  if (!customer) {
    notFound()
  }

  const customerSince = customer.signup_date
    ? new Date(customer.signup_date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : null

  const tenureDays = customer.signup_date
    ? Math.floor((Date.now() - new Date(customer.signup_date).getTime()) / (1000 * 60 * 60 * 24))
    : null

  return (
    <div className="p-4 lg:p-6 space-y-4">
      {/* Back Button */}
      <Link
        href="/customers"
        className="inline-flex items-center gap-2 text-body text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Customers
      </Link>

      {/* Header Card */}
      <div className="card">
        <div className="flex items-start gap-6">
          {/* Health Score */}
          <HealthScoreRing score={customer.health_score} />

          {/* Customer Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="text-title text-[var(--text)]">
                    {customer.name || customer.email.split('@')[0]}
                  </h1>
                  {customer.company_name && (
                    <span className="text-body text-[var(--text-muted)]">@ {customer.company_name}</span>
                  )}
                </div>
                <div className="flex items-center gap-4 mt-1 flex-wrap">
                  <p className="text-body text-[var(--text-muted)]">{customer.email}</p>
                  {(customer.location_city || customer.location_country) && (
                    <span className="flex items-center gap-1 text-caption text-[var(--text-subtle)]">
                      <MapPin className="w-3.5 h-3.5" />
                      {[customer.location_city, customer.location_country].filter(Boolean).join(', ')}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <HealthStatusBadge status={customer.health_status} />
                <StatusBadge status={customer.subscription_status} large />
              </div>
            </div>

            {/* Quick Stats */}
            <div className="flex items-center gap-6 mt-6 flex-wrap">
              <div>
                <p className="text-caption text-[var(--text-muted)]">MRR</p>
                <p className="text-body-strong text-[var(--text)]">${customer.mrr?.toLocaleString() || 0}</p>
              </div>
              <div>
                <p className="text-caption text-[var(--text-muted)]">LTV</p>
                <p className="text-body-strong text-[var(--text)]">${customer.ltv?.toLocaleString() || 0}</p>
              </div>
              <div>
                <p className="text-caption text-[var(--text-muted)]">Plan</p>
                <p className="text-body-strong text-[var(--text)]">{customer.plan_name || '—'}</p>
              </div>
              <div>
                <p className="text-caption text-[var(--text-muted)]">Customer Since</p>
                <p className="text-body-strong text-[var(--text)]">{customerSince || '—'}</p>
              </div>
              {tenureDays !== null && (
                <div>
                  <p className="text-caption text-[var(--text-muted)]">Tenure</p>
                  <p className="text-body-strong text-[var(--text)]">{tenureDays} days</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Risk Signals */}
        {(customer.mentioned_cancel || customer.is_delinquent || (customer.days_since_seen && customer.days_since_seen > 30)) && (
          <div className="mt-4 pt-4 border-t border-[var(--border)]">
            <p className="text-caption font-medium text-red-500 mb-2 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" />
              Risk Signals
            </p>
            <div className="flex flex-wrap gap-2">
              {customer.mentioned_cancel && (
                <span className="badge-error">Mentioned canceling</span>
              )}
              {customer.is_delinquent && (
                <span className="badge-error">Payment delinquent</span>
              )}
              {customer.days_since_seen && customer.days_since_seen > 30 && (
                <span className="badge-warning">Inactive {customer.days_since_seen} days</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Details Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Contact Information */}
        <InfoCard title="Contact Information">
          <div className="space-y-0.5">
            <InfoRow icon={User} label="Full Name" value={customer.name} />
            <InfoRow icon={Mail} label="Email" value={customer.email} />
            <InfoRow icon={Building2} label="Company" value={customer.company_name} />
            <InfoRow
              icon={MapPin}
              label="Location"
              value={[customer.location_city, customer.location_country].filter(Boolean).join(', ') || null}
            />
            <InfoRow icon={Briefcase} label="Industry" value={customer.industry} />
            <InfoRow icon={Building2} label="Company Size" value={customer.company_size} />
            <InfoRow icon={User} label="Account Manager" value={customer.assigned_am} />
          </div>
        </InfoCard>

        {/* About Client Business */}
        <InfoCard title="About Client Business">
          <div className="space-y-0.5">
            <InfoRow icon={Briefcase} label="Offer" value={customer.client_offer} />
            <InfoRow icon={Target} label="ICP" value={customer.client_icp} />
            <InfoRow icon={TrendingUp} label="Client LTV" value={customer.client_ltv ? `$${customer.client_ltv.toLocaleString()}` : null} />
          </div>
          {!customer.client_offer && !customer.client_icp && !customer.client_ltv && (
            <div className="mt-4 p-3 bg-[var(--surface-muted)] rounded-sm text-center">
              <p className="text-caption text-[var(--text-muted)]">
                Business details will be populated from Fathom recordings, Calendly questions, and onboarding flows.
              </p>
            </div>
          )}
        </InfoCard>

        {/* Revenue & Subscription */}
        <InfoCard title="Revenue & Subscription">
          <div className="space-y-0.5">
            <InfoRow icon={DollarSign} label="MRR" value={customer.mrr ? `$${customer.mrr.toLocaleString()}` : null} />
            <InfoRow icon={DollarSign} label="ARR" value={customer.arr ? `$${customer.arr.toLocaleString()}` : null} />
            <InfoRow icon={DollarSign} label="LTV" value={customer.ltv ? `$${customer.ltv.toLocaleString()}` : null} />
            <InfoRow icon={CreditCard} label="Plan" value={customer.plan_name} />
            <InfoRow icon={Calendar} label="Customer Since" value={customerSince} />
            {customer.stripe_customer_id && (
              <InfoRow
                icon={ExternalLink}
                label="Stripe"
                value={customer.stripe_customer_id}
                href={`https://dashboard.stripe.com/customers/${customer.stripe_customer_id}`}
              />
            )}
          </div>
        </InfoCard>

        {/* Activity */}
        <InfoCard title="Activity">
          <div className="space-y-0.5">
            <InfoRow
              icon={Activity}
              label="Last Seen"
              value={
                customer.last_seen_at
                  ? new Date(customer.last_seen_at).toLocaleDateString()
                  : null
              }
            />
            <InfoRow
              icon={Clock}
              label="Days Since Seen"
              value={customer.days_since_seen !== null ? `${customer.days_since_seen} days` : null}
            />
          </div>
        </InfoCard>

        {/* Support */}
        <InfoCard title="Support">
          <div className="space-y-0.5">
            <InfoRow
              icon={MessageSquare}
              label="Total Conversations"
              value={customer.intercom_convos_total}
            />
            <InfoRow
              icon={MessageSquare}
              label="Open Tickets"
              value={customer.open_tickets}
            />
            {customer.intercom_contact_id && process.env.NEXT_PUBLIC_INTERCOM_APP_ID && (
              <InfoRow
                icon={ExternalLink}
                label="Intercom"
                value="View in Intercom"
                href={`https://app.intercom.com/a/apps/${process.env.NEXT_PUBLIC_INTERCOM_APP_ID}/users/${customer.intercom_contact_id}/all-conversations`}
              />
            )}
          </div>
        </InfoCard>

        {/* Segmentation */}
        <InfoCard title="Segmentation">
          <div className="space-y-0.5">
            <InfoRow icon={Users} label="Customer Segment" value={customer.customer_segment} />
            <InfoRow icon={Target} label="ICP Match" value={customer.icp_match} />
            <InfoRow icon={Activity} label="MRR Tier" value={customer.mrr_tier} />
            <InfoRow icon={Calendar} label="Tenure Segment" value={customer.tenure_segment} />
            <InfoRow icon={Activity} label="Traffic Source" value={customer.traffic_source} />
          </div>
        </InfoCard>

        {/* Zoom Calls */}
        <div className="lg:col-span-2">
          <InfoCard title="Zoom Calls">
            {(() => {
              const customAttrs = customer.custom_attributes || {}
              const fathomCalls = customAttrs.fathom_recent_calls || []
              const calendlyEvents = customAttrs.calendly_events || []
              const hasCalls = fathomCalls.length > 0 || calendlyEvents.length > 0

              if (!hasCalls) {
                return (
                  <div className="empty-state !py-6">
                    <Video className="w-8 h-8 mb-2" />
                    <p className="text-body">No call data available</p>
                    <p className="text-caption mt-1">Video calls from Calendly & Fathom will appear here</p>
                  </div>
                )
              }

              return (
                <div className="space-y-4">
                  {/* Summary Stats */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 bg-[var(--surface-muted)] rounded-sm">
                    <div>
                      <p className="text-caption text-[var(--text-muted)]">Fathom Recordings</p>
                      <p className="text-body-strong text-[var(--text)]">{customAttrs.fathom_calls_count || 0}</p>
                    </div>
                    <div>
                      <p className="text-caption text-[var(--text-muted)]">Total Duration</p>
                      <p className="text-body-strong text-[var(--text)]">{customAttrs.fathom_total_duration_minutes || 0} min</p>
                    </div>
                    <div>
                      <p className="text-caption text-[var(--text-muted)]">Calendly Events</p>
                      <p className="text-body-strong text-[var(--text)]">{customAttrs.calendly_events_count || 0}</p>
                    </div>
                    <div>
                      <p className="text-caption text-[var(--text-muted)]">Show Rate</p>
                      <p className="text-body-strong text-[var(--text)]">
                        {customAttrs.calendly_show_rate !== undefined ? `${(customAttrs.calendly_show_rate * 100).toFixed(0)}%` : '—'}
                      </p>
                    </div>
                  </div>

                  {/* Fathom Recordings */}
                  {fathomCalls.length > 0 && (
                    <div>
                      <h4 className="text-caption font-medium text-[var(--text-muted)] mb-2 flex items-center gap-2">
                        <Video className="w-4 h-4" />
                        Fathom Recordings ({fathomCalls.length})
                      </h4>
                      <div className="space-y-2">
                        {fathomCalls.slice(0, 5).map((call: FathomCall, idx: number) => (
                          <div key={call.call_id || idx} className="flex items-center justify-between p-2 bg-[var(--surface-muted)] rounded-sm">
                            <div className="flex-1 min-w-0">
                              <p className="text-body text-[var(--text)] truncate">{call.title || 'Untitled Recording'}</p>
                              <p className="text-caption text-[var(--text-muted)]">
                                {call.date ? new Date(call.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                                {call.duration_minutes ? ` • ${call.duration_minutes} min` : ''}
                                {call.recorded_by && ` • Host: ${call.recorded_by}`}
                              </p>
                            </div>
                            {call.share_url && (
                              <a
                                href={call.share_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="ml-2 text-[var(--accent)] hover:underline text-caption flex items-center gap-1"
                              >
                                View <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                        ))}
                        {fathomCalls.length > 5 && (
                          <p className="text-caption text-[var(--text-muted)] text-center">
                            +{fathomCalls.length - 5} more recordings
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Calendly Events */}
                  {calendlyEvents.length > 0 && (
                    <div>
                      <h4 className="text-caption font-medium text-[var(--text-muted)] mb-2 flex items-center gap-2">
                        <Calendar className="w-4 h-4" />
                        Calendly Bookings ({calendlyEvents.length})
                      </h4>
                      <div className="space-y-2">
                        {calendlyEvents.slice(0, 5).map((event: CalendlyEvent, idx: number) => (
                          <div key={event.event_id || idx} className="flex items-center justify-between p-2 bg-[var(--surface-muted)] rounded-sm">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-body text-[var(--text)] truncate">{event.event_name || event.event_type || 'Meeting'}</p>
                                {event.status && (
                                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                                    event.status === 'active' ? 'bg-green-100 text-green-700' :
                                    event.status === 'canceled' ? 'bg-red-100 text-red-700' :
                                    'bg-gray-100 text-gray-600'
                                  }`}>
                                    {event.status}
                                  </span>
                                )}
                                {event.no_show && (
                                  <span className="text-xs px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">No Show</span>
                                )}
                              </div>
                              <p className="text-caption text-[var(--text-muted)]">
                                {event.start_time ? new Date(event.start_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'}
                                {event.organizer && ` • Host: ${event.organizer}`}
                              </p>
                            </div>
                          </div>
                        ))}
                        {calendlyEvents.length > 5 && (
                          <p className="text-caption text-[var(--text-muted)] text-center">
                            +{calendlyEvents.length - 5} more events
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}
          </InfoCard>
        </div>

        {/* Phone Calls & SMS */}
        <InfoCard title="Phone Calls & SMS">
          <div className="empty-state !py-6">
            <Phone className="w-8 h-8 mb-2" />
            <p className="text-body">Outbound calls & SMS from Aloware</p>
            <p className="text-caption mt-1">Tracks outbound communication</p>
          </div>
        </InfoCard>
      </div>

      {/* Campaigns */}
      <div className="card !p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)]">
          <h3 className="text-body-strong text-[var(--text)]">Campaigns</h3>
        </div>
        {campaigns.length === 0 ? (
          <div className="empty-state">
            <Send className="w-8 h-8 mb-2" />
            <p className="text-body">No campaigns found</p>
            <p className="text-caption mt-1">Campaign data from SmartLead.ai will appear here</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="table-header">
                  <th className="text-left">Campaign</th>
                  <th className="text-left">Status</th>
                  <th className="text-right">Leads</th>
                  <th className="text-right">Sent</th>
                  <th className="text-right">Reply Rate</th>
                  <th className="text-right">Positive</th>
                  <th className="text-right">Bounce</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((campaign) => (
                  <tr key={campaign.id} className="table-row">
                    <td className="py-2 px-3">
                      <span className="text-body-strong text-[var(--text)]">{campaign.campaign_name}</span>
                    </td>
                    <td className="py-2 px-3">
                      <CampaignStatusBadge status={campaign.status} />
                    </td>
                    <td className="py-2 px-3 text-right text-body text-[var(--text)]">
                      {campaign.leads_count.toLocaleString()}
                    </td>
                    <td className="py-2 px-3 text-right text-body text-[var(--text)]">
                      {campaign.emails_sent.toLocaleString()}
                    </td>
                    <td className="py-2 px-3 text-right text-body text-[var(--text)]">
                      {campaign.reply_rate !== null ? `${campaign.reply_rate.toFixed(1)}%` : '—'}
                    </td>
                    <td className="py-2 px-3 text-right text-body text-[var(--text)]">
                      {campaign.positive_reply_rate !== null ? `${campaign.positive_reply_rate.toFixed(1)}%` : '—'}
                    </td>
                    <td className="py-2 px-3 text-right text-body text-[var(--text)]">
                      {campaign.bounce_rate !== null ? `${campaign.bounce_rate.toFixed(1)}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Timeline */}
      <div className="card">
        <h3 className="text-body-strong text-[var(--text)] mb-4">Timeline</h3>
        <div className="empty-state">
          <Clock className="w-8 h-8 mb-2" />
          <p className="text-body">Activity timeline coming soon</p>
          <p className="text-caption mt-1">Will show support tickets, calls, payments, and health changes</p>
        </div>
      </div>
    </div>
  )
}
