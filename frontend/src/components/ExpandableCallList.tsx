'use client'

import { useState } from 'react'
import { Video, Calendar, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react'

interface FathomCall {
  call_id: string | null
  title: string | null
  date: string | null
  duration_minutes: number | null
  url: string | null
  share_url: string | null
  recorded_by: string | null
}

interface CalendlyEvent {
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
  organizer: string | null
}

interface ExpandableCallListProps {
  fathomCalls: FathomCall[]
  calendlyEvents: CalendlyEvent[]
  customAttrs: {
    fathom_calls_count?: number
    fathom_total_duration_minutes?: number
    calendly_events_count?: number
    calendly_show_rate?: number
  }
}

export default function ExpandableCallList({ fathomCalls, calendlyEvents, customAttrs }: ExpandableCallListProps) {
  const [showAllFathom, setShowAllFathom] = useState(false)
  const [showAllCalendly, setShowAllCalendly] = useState(false)

  const displayedFathomCalls = showAllFathom ? fathomCalls : fathomCalls.slice(0, 5)
  const displayedCalendlyEvents = showAllCalendly ? calendlyEvents : calendlyEvents.slice(0, 5)

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
            {displayedFathomCalls.map((call, idx) => (
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
              <button
                onClick={() => setShowAllFathom(!showAllFathom)}
                className="w-full py-2 text-caption text-[var(--accent)] hover:text-[var(--accent-hover)] flex items-center justify-center gap-1 transition-colors"
              >
                {showAllFathom ? (
                  <>
                    Show less <ChevronUp className="w-4 h-4" />
                  </>
                ) : (
                  <>
                    Show {fathomCalls.length - 5} more recordings <ChevronDown className="w-4 h-4" />
                  </>
                )}
              </button>
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
            {displayedCalendlyEvents.map((event, idx) => (
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
              <button
                onClick={() => setShowAllCalendly(!showAllCalendly)}
                className="w-full py-2 text-caption text-[var(--accent)] hover:text-[var(--accent-hover)] flex items-center justify-center gap-1 transition-colors"
              >
                {showAllCalendly ? (
                  <>
                    Show less <ChevronUp className="w-4 h-4" />
                  </>
                ) : (
                  <>
                    Show {calendlyEvents.length - 5} more events <ChevronDown className="w-4 h-4" />
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
