'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, Bot, User, Sparkles, RefreshCw, Trash2, AlertCircle } from 'lucide-react'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  error?: boolean
}

const SUGGESTIONS = [
  "Which customers are at risk of churning?",
  "What's our average health score by segment?",
  "Show me customers with MRR over $500 who haven't been contacted recently",
  "Summarize the revenue breakdown by plan type",
  "Which account manager has the healthiest book of business?",
  "What trends do you see in our customer health data?",
]

export default function AIAssistantPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 200)}px`
    }
  }, [input])

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
    setError(null)

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
      setError(errorMessage)

      const errorResponse: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `I'm sorry, I encountered an error: ${errorMessage}\n\nPlease make sure the ANTHROPIC_API_KEY is configured in your environment variables.`,
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

  const clearChat = () => {
    setMessages([])
    setError(null)
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
        elements.push(<h4 key={idx} className="text-body-strong mt-4 mb-2">{formatInlineText(line.slice(4))}</h4>)
      } else if (line.startsWith('## ')) {
        flushList()
        elements.push(<h3 key={idx} className="text-body-strong mt-4 mb-2">{formatInlineText(line.slice(3))}</h3>)
      } else if (line.startsWith('# ')) {
        flushList()
        elements.push(<h2 key={idx} className="text-title mt-4 mb-2">{formatInlineText(line.slice(2))}</h2>)
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
    return <div className="space-y-1">{elements}</div>
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

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-gradient-to-br from-[var(--secondary)] to-[var(--primary)] flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-title text-[var(--text)]">AI Assistant</h1>
              <p className="text-caption text-[var(--text-muted)]">
                Powered by Claude · Ask anything about your customers
              </p>
            </div>
          </div>
          {messages.length > 0 && (
            <button onClick={clearChat} className="btn-secondary btn-sm">
              <Trash2 className="w-4 h-4" />
              Clear Chat
            </button>
          )}
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 bg-[var(--bg)]">
        {messages.length === 0 ? (
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-8">
              <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-[var(--secondary)] to-[var(--primary)] flex items-center justify-center mx-auto mb-4">
                <Bot className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-title text-[var(--text)] mb-2">How can I help you today?</h2>
              <p className="text-body text-[var(--text-muted)]">
                I have access to all your customer data, health scores, revenue metrics, and analytics.
                Ask me anything about your customers or business performance.
              </p>
            </div>

            <div className="space-y-3">
              <p className="text-caption text-[var(--text-muted)] font-medium">Try asking:</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {SUGGESTIONS.map((suggestion, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSuggestionClick(suggestion)}
                    className="text-left p-4 bg-[var(--surface)] border border-[var(--border)] rounded-md hover:border-[var(--primary)] hover:shadow-sm transition-all text-body text-[var(--text)]"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-3 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}
              >
                <div
                  className={`avatar avatar-sm flex-shrink-0 ${
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
              <div className="flex gap-3">
                <div className="avatar avatar-sm bg-gradient-to-br from-[var(--secondary)] to-[var(--primary)] text-white flex-shrink-0">
                  <Bot className="w-3.5 h-3.5" />
                </div>
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-md rounded-tl-none p-3">
                  <div className="flex items-center gap-2 text-[var(--text-muted)]">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span className="text-caption">Analyzing your customer data...</span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="px-4 py-3 border-t border-[var(--border)] bg-[var(--surface)]">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
          <div className="flex items-end gap-3">
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
              placeholder="Ask about your customers, revenue, health scores..."
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
            Enter to send · Shift+Enter for new line
          </p>
        </form>
      </div>
    </div>
  )
}
