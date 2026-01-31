'use client'

import { useState, useEffect, useRef } from 'react'
import { Bookmark, X, Trash2, Check, ChevronDown } from 'lucide-react'
import { FilterState, defaultFilters } from './FilterPanel'

interface SavedFilter {
  id: string
  name: string
  filters: FilterState
  createdAt: string
}

interface SavedFiltersProps {
  currentFilters: FilterState
  onApplyFilter: (filters: FilterState) => void
}

const STORAGE_KEY = 'listkit-saved-filters'

function getSavedFilters(): SavedFilter[] {
  if (typeof window === 'undefined') return []
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved ? JSON.parse(saved) : []
  } catch {
    return []
  }
}

function saveSavedFilters(filters: SavedFilter[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filters))
}

export default function SavedFilters({ currentFilters, onApplyFilter }: SavedFiltersProps) {
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([])
  const [showSavedList, setShowSavedList] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setSavedFilters(getSavedFilters())
  }, [])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowSavedList(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleDeleteFilter = (id: string) => {
    const updated = savedFilters.filter(f => f.id !== id)
    setSavedFilters(updated)
    saveSavedFilters(updated)
  }

  const handleApplyFilter = (filter: SavedFilter) => {
    onApplyFilter(filter.filters)
    setShowSavedList(false)
  }

  const getFilterSummary = (filters: FilterState): string => {
    const parts: string[] = []
    if (filters.am.length) parts.push(`${filters.am.length} AM${filters.am.length > 1 ? 's' : ''}`)
    if (filters.status.length) parts.push(`${filters.status.length} status`)
    if (filters.segment.length) parts.push(`${filters.segment.length} segment${filters.segment.length > 1 ? 's' : ''}`)
    if (filters.plan.length) parts.push(`${filters.plan.length} plan${filters.plan.length > 1 ? 's' : ''}`)
    if (filters.healthMin > 0 || filters.healthMax < 100) parts.push('health range')
    if (filters.mrrMin > 0 || filters.mrrMax < 10000) parts.push('MRR range')
    return parts.length ? parts.join(', ') : 'No filters'
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setShowSavedList(!showSavedList)}
        className="chip"
      >
        <Bookmark className="w-3.5 h-3.5" />
        Saved filters
        {savedFilters.length > 0 && (
          <span className="count-badge">{savedFilters.length}</span>
        )}
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showSavedList ? 'rotate-180' : ''}`} />
      </button>

      {showSavedList && (
        <div className="absolute top-full left-0 mt-2 w-72 bg-[var(--surface)] border border-[var(--border)] rounded-md shadow-md z-30 overflow-hidden">
          <div className="px-3 py-2 border-b border-[var(--border)] bg-[var(--surface-muted)]">
            <h4 className="text-body-strong text-[var(--text)]">Saved Filters</h4>
          </div>
          {savedFilters.length === 0 ? (
            <div className="px-3 py-6 text-center">
              <Bookmark className="w-6 h-6 mx-auto mb-2 text-[var(--text-subtle)]" />
              <p className="text-caption text-[var(--text-muted)]">No saved filters yet</p>
              <p className="text-caption text-[var(--text-subtle)] mt-1">
                Use the "Save filter" button in the filter panel
              </p>
            </div>
          ) : (
            <div className="max-h-64 overflow-y-auto">
              {savedFilters.map((filter) => (
                <div
                  key={filter.id}
                  className="px-3 py-2.5 border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--surface-muted)] transition-colors group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <button
                      onClick={() => handleApplyFilter(filter)}
                      className="flex-1 text-left"
                    >
                      <p className="text-body-strong text-[var(--text)]">{filter.name}</p>
                      <p className="text-caption text-[var(--text-muted)] mt-0.5">
                        {getFilterSummary(filter.filters)}
                      </p>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteFilter(filter.id)
                      }}
                      className="p-1 text-[var(--text-muted)] hover:text-red-500 hover:bg-red-50 rounded-sm transition-colors opacity-0 group-hover:opacity-100"
                      title="Delete filter"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
