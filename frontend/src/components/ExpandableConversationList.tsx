'use client'

import { useState } from 'react'
import { ExternalLink, ChevronDown, ChevronUp } from 'lucide-react'

interface IntercomConversation {
  conversation_id: string
  subject: string | null
  preview: string | null
  source_type: string | null
  delivered_as: string | null
  state: string | null
  priority: string | null
  created_at: number | null
  updated_at: number | null
  waiting_since: number | null
  read: boolean
  author_name: string | null
  author_email: string | null
  author_type: string | null
  intercom_url: string
  tags: string[]
  parts_count: number
}

interface ExpandableConversationListProps {
  conversations: IntercomConversation[]
  totalCount: number
  openCount: number
  last30Days: number
  mentionedCancel: boolean
}

export default function ExpandableConversationList({
  conversations,
  totalCount,
  openCount,
  last30Days,
  mentionedCancel
}: ExpandableConversationListProps) {
  const [showAll, setShowAll] = useState(false)

  const displayedConversations = showAll ? conversations : conversations.slice(0, 10)

  return (
    <div className="space-y-4">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 bg-[var(--surface-muted)] rounded-sm">
        <div>
          <p className="text-caption text-[var(--text-muted)]">Total Conversations</p>
          <p className="text-body-strong text-[var(--text)]">{totalCount || conversations.length}</p>
        </div>
        <div>
          <p className="text-caption text-[var(--text-muted)]">Open</p>
          <p className="text-body-strong text-[var(--text)]">{openCount || 0}</p>
        </div>
        <div>
          <p className="text-caption text-[var(--text-muted)]">Last 30 Days</p>
          <p className="text-body-strong text-[var(--text)]">{last30Days || 0}</p>
        </div>
        <div>
          <p className="text-caption text-[var(--text-muted)]">Cancel Mentioned</p>
          <p className="text-body-strong text-[var(--text)]">{mentionedCancel ? 'Yes' : 'No'}</p>
        </div>
      </div>

      {/* Conversations List */}
      <div className="space-y-2">
        {displayedConversations.map((convo, idx) => (
          <a
            key={convo.conversation_id || idx}
            href={convo.intercom_url}
            target="_blank"
            rel="noopener noreferrer"
            className="block p-3 bg-[var(--surface-muted)] rounded-sm hover:bg-[var(--surface-hover)] transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-body text-[var(--text)] font-medium truncate">
                    {convo.subject || 'No Subject'}
                  </p>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    convo.state === 'open' ? 'bg-yellow-100 text-yellow-700' :
                    convo.state === 'closed' ? 'bg-green-100 text-green-700' :
                    convo.state === 'snoozed' ? 'bg-blue-100 text-blue-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {convo.state || 'unknown'}
                  </span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    convo.source_type === 'email' ? 'bg-purple-100 text-purple-700' :
                    convo.source_type === 'conversation' ? 'bg-blue-100 text-blue-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {convo.source_type || 'chat'}
                  </span>
                  {!convo.read && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-700">Unread</span>
                  )}
                </div>
                <p className="text-caption text-[var(--text-muted)] mt-1 line-clamp-2">
                  {convo.preview || 'No preview available'}
                </p>
                <p className="text-caption text-[var(--text-subtle)] mt-1">
                  {convo.created_at ? new Date(convo.created_at * 1000).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit'
                  }) : '—'}
                  {convo.author_name && ` • From: ${convo.author_name}`}
                  {convo.parts_count > 0 && ` • ${convo.parts_count} messages`}
                </p>
              </div>
              <ExternalLink className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0 mt-1" />
            </div>
          </a>
        ))}
        {conversations.length > 10 && (
          <button
            onClick={(e) => {
              e.preventDefault()
              setShowAll(!showAll)
            }}
            className="w-full py-2 text-caption text-[var(--accent)] hover:text-[var(--accent-hover)] flex items-center justify-center gap-1 transition-colors"
          >
            {showAll ? (
              <>
                Show less <ChevronUp className="w-4 h-4" />
              </>
            ) : (
              <>
                Show {conversations.length - 10} more conversations <ChevronDown className="w-4 h-4" />
              </>
            )}
          </button>
        )}
      </div>
    </div>
  )
}
