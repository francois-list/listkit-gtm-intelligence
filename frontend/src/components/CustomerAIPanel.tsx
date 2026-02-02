'use client'

import { useState, useRef, useEffect } from 'react'
import { X, Send, Bot, User, Sparkles, RefreshCw, AlertCircle } from 'lucide-react'
import type { Customer } from '@/lib/supabase'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  error?: boolean
}

interface CustomerAIPanelProps {
  customer: Customer
  onClose: () => void
}

// Generate suggested questions based on customer state
function getSuggestedQuestions(customer: Customer): string[] {
  const questions: string[] = []

  // Always include general analysis
  questions.push("What are the key insights about this customer?")

  // Health-based questions
  if (customer.health_score !== null && customer.health_score < 50) {
    questions.push("Why is this customer's health score so low?")
    questions.push("What immediate actions can prevent churn?")
  }

  // Risk signal questions
  if (customer.mentioned_cancel) {
    questions.push("The customer mentioned canceling - what should we do?")
  }

  if (customer.is_delinquent) {
    questions.push("How should we handle the payment issue?")
  }

  if (customer.days_since_seen !== null && customer.days_since_seen > 30) {
    questions.push("The customer has been inactive - how can we re-engage them?")
  }

  // Growth questions for healthy customers
  if (customer.health_score !== null && customer.health_score >= 70) {
    questions.push("What expansion opportunities exist for this account?")
    questions.push("How can we turn this customer into an advocate?")
  }

  // If no specific signals, add general questions
  if (questions.length < 4) {
    questions.push("What should the AM focus on for this account?")
    questions.push("Are there any warning signs I should be aware of?")
  }

  return questions.slice(0, 4) // Max 4 suggestions
}

export default function CustomerAIPanel({ customer, onClose }: CustomerAIPanelProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isVisible, setIsVisible] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const suggestedQuestions = getSuggestedQuestions(customer)

  // Animate in on mount
  useEffect(() => {
    requestAnimationFrame(() => {
      setIsVisible(true)
    })
  }, [])

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 120)}px`
    }
  }, [input])

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleClose = () => {
    setIsVisible(false)
    setTimeout(onClose, 300) // Wait for animation to complete
  }

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleClose()
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    }

    const updatedMessages = [...messages, userMessage]
    setMessages(updatedMessages)
    setInput('')
    setIsLoading(true)

    try {
      const response = await fetch('/api/chat/customer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: customer.customer_id,
          messages: updatedMessages.map(m => ({
            role: m.role,
            content: m.content,
          })),
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to get response')
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.message,
        timestamp: new Date(),
      }
      setMessages(prev => [...prev, assistantMessage])
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred'

      const errorResponse: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `I'm sorry, I encountered an error: ${errorMessage}\n\nPlease make sure the ANTHROPIC_API_KEY is configured.`,
        timestamp: new Date(),
        error: true,
      }
      setMessages(prev => [...prev, errorResponse])
    } finally {
      setIsLoading(false)
    }
  }

  const handleSuggestionClick = (suggestion: string) => {
    setInput(suggestion)
    inputRef.current?.focus()
  }

  const formatMessage = (content: string, isAssistant: boolean) => {
    if (!isAssistant) {
      return <p className="whitespace-pre-wrap text-body">{content}</p>
    }

    const lines = content.split('\n')
    const elements: JSX.Element[] = []
    let listItems: string[] = []
    let listType: 'ul' | 'ol' | null = null

    const flushList = () => {
      if (listItems.length > 0 && listType) {
        const ListTag = listType
        elements.push(
          <ListTag key={elements.length} className={`${listType === 'ol' ? 'list-decimal' : 'list-disc'} list-inside space-y-1 my-2`}>
            {listItems.map((item, i) => (
              <li key={i} className="text-body">{formatInlineText(item)}</li>
            ))}
          </ListTag>
        )
        listItems = []
        listType = null
      }
    }

    lines.forEach((line, idx) => {
      if (line.startsWith('### ')) {
        flushList()
        elements.push(<h4 key={idx} className="text-body-strong mt-3 mb-1">{formatInlineText(line.slice(4))}</h4>)
      } else if (line.startsWith('## ')) {
        flushList()
        elements.push(<h3 key={idx} className="text-body-strong mt-3 mb-1">{formatInlineText(line.slice(3))}</h3>)
      } else if (line.startsWith('# ')) {
        flushList()
        elements.push(<h2 key={idx} className="text-title mt-3 mb-1">{formatInlineText(line.slice(2))}</h2>)
      } else if (line.match(/^[•\-\*]\s/)) {
        if (listType !== 'ul') {
          flushList()
          listType = 'ul'
        }
        listItems.push(line.slice(2))
      } else if (line.match(/^\d+\.\s/)) {
        if (listType !== 'ol') {
          flushList()
          listType = 'ol'
        }
        listItems.push(line.replace(/^\d+\.\s/, ''))
      } else if (line.trim() === '') {
        flushList()
        elements.push(<div key={idx} className="h-2" />)
      } else {
        flushList()
        elements.push(<p key={idx} className="text-body my-1">{formatInlineText(line)}</p>)
      }
    })

    flushList()
    return <div className="space-y-0.5">{elements}</div>
  }

  const formatInlineText = (text: string): (string | JSX.Element)[] => {
    const parts: (string | JSX.Element)[] = []
    let remaining = text
    let keyIdx = 0

    while (remaining.length > 0) {
      const boldMatch = remaining.match(/\*\*(.+?)\*\*/)
      if (boldMatch && boldMatch.index !== undefined) {
        if (boldMatch.index > 0) {
          parts.push(remaining.slice(0, boldMatch.index))
        }
        parts.push(<strong key={keyIdx++} className="font-semibold">{boldMatch[1]}</strong>)
        remaining = remaining.slice(boldMatch.index + boldMatch[0].length)
      } else {
        parts.push(remaining)
        break
      }
    }

    return parts
  }

  // Get health color
  const getHealthColor = (score: number | null) => {
    if (score === null) return 'var(--text-muted)'
    if (score >= 70) return 'var(--success-text)'
    if (score >= 50) return 'var(--warning-text)'
    return '#EF4444'
  }

  return (
    <div
      className={`fixed inset-0 z-50 transition-opacity duration-300 ${isVisible ? 'opacity-100' : 'opacity-0'}`}
      onClick={handleBackdropClick}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" />

      {/* Panel */}
      <div
        ref={panelRef}
        className={`absolute right-0 top-0 h-full w-full max-w-[480px] bg-[var(--surface)] shadow-xl flex flex-col transform transition-transform duration-300 ${isVisible ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-[var(--border)] flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-md bg-gradient-to-br from-[var(--secondary)] to-[var(--primary)] flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <h2 className="text-body-strong text-[var(--text)]">Analyze Customer</h2>
            </div>
            <button
              onClick={handleClose}
              className="p-2 hover:bg-[var(--surface-muted)] rounded-md transition-colors"
              aria-label="Close panel"
            >
              <X className="w-5 h-5 text-[var(--text-muted)]" />
            </button>
          </div>

          {/* Customer Summary */}
          <div className="bg-[var(--bg)] rounded-md p-3">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-body-strong text-[var(--text)] truncate">
                  {customer.name || customer.email.split('@')[0]}
                  {customer.company_name && (
                    <span className="text-[var(--text-muted)] font-normal"> @ {customer.company_name}</span>
                  )}
                </p>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-caption text-[var(--text-muted)]">
                    Health: <span style={{ color: getHealthColor(customer.health_score) }} className="font-medium">{customer.health_score ?? '—'}</span>
                  </span>
                  <span className="text-caption text-[var(--text-muted)]">
                    MRR: <span className="font-medium text-[var(--text)]">${customer.mrr?.toLocaleString() || 0}</span>
                  </span>
                  {customer.health_status && (
                    <span className={`text-caption font-medium ${
                      customer.health_status === 'healthy' ? 'text-[var(--success-text)]' :
                      customer.health_status === 'critical' ? 'text-red-500' :
                      'text-[var(--warning-text)]'
                    }`}>
                      {customer.health_status.replace('_', ' ').charAt(0).toUpperCase() + customer.health_status.slice(1).replace('_', ' ')}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-4 bg-[var(--bg)]">
          {messages.length === 0 ? (
            <div className="space-y-4">
              <div className="text-center py-4">
                <div className="w-12 h-12 rounded-md bg-gradient-to-br from-[var(--secondary)] to-[var(--primary)] flex items-center justify-center mx-auto mb-3">
                  <Bot className="w-6 h-6 text-white" />
                </div>
                <p className="text-body text-[var(--text)]">How can I help you analyze this customer?</p>
                <p className="text-caption text-[var(--text-muted)] mt-1">
                  I have access to their full profile, activity, and history.
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-caption text-[var(--text-muted)] font-medium">Suggested questions:</p>
                {suggestedQuestions.map((question, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSuggestionClick(question)}
                    className="w-full text-left p-3 bg-[var(--surface)] border border-[var(--border)] rounded-md hover:border-[var(--primary)] hover:shadow-sm transition-all text-body text-[var(--text)]"
                  >
                    {question}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-2 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}
                >
                  <div
                    className={`w-7 h-7 rounded-md flex-shrink-0 flex items-center justify-center ${
                      message.role === 'user'
                        ? 'bg-[var(--primary)] text-white'
                        : message.error
                        ? 'bg-red-500 text-white'
                        : 'bg-gradient-to-br from-[var(--secondary)] to-[var(--primary)] text-white'
                    }`}
                  >
                    {message.role === 'user' ? (
                      <User className="w-3.5 h-3.5" />
                    ) : message.error ? (
                      <AlertCircle className="w-3.5 h-3.5" />
                    ) : (
                      <Bot className="w-3.5 h-3.5" />
                    )}
                  </div>

                  <div className={`flex-1 ${message.role === 'user' ? 'text-right' : ''}`}>
                    <div
                      className={`inline-block max-w-full p-3 rounded-md text-left ${
                        message.role === 'user'
                          ? 'bg-[var(--primary)] text-white rounded-tr-none'
                          : message.error
                          ? 'bg-red-50 border border-red-200 rounded-tl-none text-[var(--text)]'
                          : 'bg-[var(--surface)] border border-[var(--border)] rounded-tl-none text-[var(--text)]'
                      }`}
                    >
                      {formatMessage(message.content, message.role === 'assistant')}
                    </div>
                    <p className="text-caption text-[var(--text-subtle)] mt-1">
                      {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="flex gap-2">
                  <div className="w-7 h-7 rounded-md bg-gradient-to-br from-[var(--secondary)] to-[var(--primary)] text-white flex-shrink-0 flex items-center justify-center">
                    <Bot className="w-3.5 h-3.5" />
                  </div>
                  <div className="bg-[var(--surface)] border border-[var(--border)] rounded-md rounded-tl-none p-3">
                    <div className="flex items-center gap-2 text-[var(--text-muted)]">
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span className="text-caption">Analyzing customer data...</span>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="px-4 py-3 border-t border-[var(--border)] flex-shrink-0">
          <form onSubmit={handleSubmit}>
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSubmit(e)
                  }
                }}
                placeholder="Ask about this customer..."
                className="input flex-1 resize-none min-h-[44px] max-h-[120px]"
                rows={1}
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="btn-primary h-11 w-11 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
            <p className="text-caption text-[var(--text-subtle)] mt-2 text-center">
              Enter to send · Esc to close
            </p>
          </form>
        </div>
      </div>
    </div>
  )
}
