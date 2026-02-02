'use client'

import { useState } from 'react'
import {
  X,
  ChevronDown,
  ChevronRight,
  Users,
  Briefcase,
  Tag,
  Activity,
  DollarSign,
  MapPin,
  Building2,
  Target,
  Clock,
  Bookmark,
  Layers,
  Check,
} from 'lucide-react'

const STORAGE_KEY = 'listkit-saved-filters'

interface SavedFilter {
  id: string
  name: string
  filters: FilterState
  createdAt: string
}

export interface FilterState {
  search: string
  am: string[]
  segment: string[]
  trafficSource: string[]
  status: string[]
  healthMin: number
  healthMax: number
  plan: string[]
  mrrMin: number
  mrrMax: number
  location: string[]
  industry: string[]
  companySize: string[]
  icpMatch: string[]
  lastSeen: string
}

export const defaultFilters: FilterState = {
  search: '',
  am: [],
  segment: [],
  trafficSource: [],
  status: [],
  healthMin: 0,
  healthMax: 100,
  plan: [],
  mrrMin: 0,
  mrrMax: 10000,
  location: [],
  industry: [],
  companySize: [],
  icpMatch: [],
  lastSeen: '',
}

interface FilterPanelProps {
  filters: FilterState
  onChange: (filters: FilterState) => void
  filterOptions: {
    ams: string[]
    segments: string[]
    trafficSources: string[]
    plans: string[]
    locations: string[]
    industries: string[]
    companySizes: string[]
  }
  collapsed: boolean
  onToggle: () => void
}

interface AccordionRowProps {
  label: string
  icon: React.ComponentType<{ className?: string }>
  isExpanded: boolean
  onToggle: () => void
  hasValue?: boolean
  badge?: string
}

function AccordionRow({ label, icon: Icon, isExpanded, onToggle, hasValue, badge }: AccordionRowProps) {
  return (
    <button
      onClick={onToggle}
      className="accordion-row w-full"
    >
      <Icon className={`w-4 h-4 ${hasValue ? 'text-[var(--primary)]' : 'text-[var(--text-muted)]'}`} />
      <span className={`flex-1 text-left text-body ${hasValue ? 'text-[var(--primary)] font-medium' : 'text-[var(--text)]'}`}>
        {label}
      </span>
      {badge && (
        <span className="badge-info text-[10px] px-1.5 py-0.5 mr-2">{badge}</span>
      )}
      {hasValue && (
        <span className="w-2 h-2 rounded-full bg-[var(--primary)] mr-2" />
      )}
      {isExpanded ? (
        <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />
      ) : (
        <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />
      )}
    </button>
  )
}

interface MultiSelectProps {
  options: string[]
  selected: string[]
  onChange: (selected: string[]) => void
  placeholder?: string
}

function MultiSelect({ options, selected, onChange }: MultiSelectProps) {
  const toggleOption = (option: string) => {
    if (selected.includes(option)) {
      onChange(selected.filter(s => s !== option))
    } else {
      onChange([...selected, option])
    }
  }

  return (
    <div className="px-3 pb-3 space-y-2">
      {/* Selected chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selected.slice(0, 3).map(item => (
            <span key={item} className="chip text-caption">
              {item}
              <button
                onClick={() => toggleOption(item)}
                className="ml-1 hover:text-[var(--primary)]"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          {selected.length > 3 && (
            <span className="chip text-caption text-[var(--primary)]">
              +{selected.length - 3} more
            </span>
          )}
        </div>
      )}
      {/* Options list */}
      <div className="max-h-40 overflow-y-auto space-y-0.5">
        {options.length === 0 ? (
          <p className="text-caption text-[var(--text-muted)] py-2">No options available</p>
        ) : (
          options.map(option => (
            <label
              key={option}
              className="flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-[var(--surface-muted)] cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selected.includes(option)}
                onChange={() => toggleOption(option)}
                className="w-4 h-4 rounded border-[var(--border)] text-[var(--primary)] focus:ring-[var(--primary)]"
              />
              <span className="text-body text-[var(--text)]">{option}</span>
            </label>
          ))
        )}
      </div>
    </div>
  )
}

interface RangeSliderProps {
  min: number
  max: number
  minValue: number
  maxValue: number
  onChange: (min: number, max: number) => void
  prefix?: string
  step?: number
}

function RangeSlider({ min, max, minValue, maxValue, onChange, prefix = '', step = 1 }: RangeSliderProps) {
  const minPercent = ((minValue - min) / (max - min)) * 100
  const maxPercent = ((maxValue - min) / (max - min)) * 100

  return (
    <div className="px-3 pb-3 space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <label className="text-caption text-[var(--text-muted)] mb-1 block">Min</label>
          <div className="flex items-center">
            {prefix && <span className="text-caption text-[var(--text-muted)] mr-1">{prefix}</span>}
            <input
              type="number"
              value={minValue}
              onChange={(e) => onChange(Math.min(Number(e.target.value) || 0, maxValue), maxValue)}
              className="input !py-1.5 text-caption"
              min={min}
              max={max}
              step={step}
            />
          </div>
        </div>
        <span className="text-[var(--text-muted)] pt-5">—</span>
        <div className="flex-1">
          <label className="text-caption text-[var(--text-muted)] mb-1 block">Max</label>
          <div className="flex items-center">
            {prefix && <span className="text-caption text-[var(--text-muted)] mr-1">{prefix}</span>}
            <input
              type="number"
              value={maxValue}
              onChange={(e) => onChange(minValue, Math.max(Number(e.target.value) || 0, minValue))}
              className="input !py-1.5 text-caption"
              min={min}
              max={max}
              step={step}
            />
          </div>
        </div>
      </div>
      {/* Dual-thumb range slider */}
      <div className="relative h-5">
        {/* Track background */}
        <div className="absolute top-1/2 -translate-y-1/2 w-full h-1 bg-[var(--surface-muted)] rounded-pill" />
        {/* Active range highlight */}
        <div
          className="absolute top-1/2 -translate-y-1/2 h-1 bg-[var(--primary)] rounded-pill"
          style={{ left: `${minPercent}%`, width: `${maxPercent - minPercent}%` }}
        />
        {/* Min slider */}
        <input
          type="range"
          min={min}
          max={max}
          value={minValue}
          onChange={(e) => onChange(Math.min(Number(e.target.value), maxValue - step), maxValue)}
          className="absolute w-full h-5 appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-[var(--primary)] [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:shadow-md [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:bg-[var(--primary)] [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:shadow-md"
          step={step}
          style={{ zIndex: minValue > max - step ? 5 : 3 }}
        />
        {/* Max slider */}
        <input
          type="range"
          min={min}
          max={max}
          value={maxValue}
          onChange={(e) => onChange(minValue, Math.max(Number(e.target.value), minValue + step))}
          className="absolute w-full h-5 appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-[var(--primary)] [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:shadow-md [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:bg-[var(--primary)] [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:shadow-md"
          step={step}
          style={{ zIndex: 4 }}
        />
      </div>
    </div>
  )
}

export default function FilterPanel({ filters, onChange, filterOptions, collapsed, onToggle }: FilterPanelProps) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    am: false,
    segment: false,
    status: true,
    health: false,
    plan: false,
    mrr: false,
    location: false,
    industry: false,
    companySize: false,
    icpMatch: false,
    lastSeen: false,
    trafficSource: false,
  })
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [filterName, setFilterName] = useState('')
  const [saveSuccess, setSaveSuccess] = useState(false)

  const toggleSection = (key: string) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const handleSaveFilter = () => {
    if (!filterName.trim()) return

    const savedFilters: SavedFilter[] = (() => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY)
        return saved ? JSON.parse(saved) : []
      } catch {
        return []
      }
    })()

    const newFilter: SavedFilter = {
      id: Date.now().toString(),
      name: filterName.trim(),
      filters: filters,
      createdAt: new Date().toISOString(),
    }

    savedFilters.push(newFilter)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedFilters))

    // Dispatch custom event to notify SavedFilters component
    window.dispatchEvent(new CustomEvent('savedFiltersUpdated'))

    setSaveSuccess(true)
    setTimeout(() => {
      setShowSaveDialog(false)
      setFilterName('')
      setSaveSuccess(false)
    }, 1000)
  }

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

  const handleReset = () => {
    onChange(defaultFilters)
  }

  // Collapsed state - fully hide the filter panel
  if (collapsed) {
    return null
  }

  return (
    <div className="w-[300px] bg-[var(--surface)] border-r border-[var(--border)] h-full overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <span className="text-body-strong text-[var(--text)]">Filter</span>
          {activeFilterCount > 0 && (
            <span className="count-badge">{activeFilterCount}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {activeFilterCount > 0 && (
            <button onClick={handleReset} className="btn-secondary btn-sm">
              Reset
            </button>
          )}
          <button
            onClick={() => setShowSaveDialog(true)}
            className="btn-primary btn-sm"
            disabled={activeFilterCount === 0}
          >
            <Bookmark className="w-3 h-3" />
            Save filter
          </button>
        </div>
      </div>

      {/* Save Filter Dialog */}
      {showSaveDialog && (
        <div className="px-3 py-3 border-b border-[var(--border)] bg-[var(--surface-muted)]">
          {saveSuccess ? (
            <div className="flex items-center gap-2 text-[var(--success-text)]">
              <Check className="w-4 h-4" />
              <span className="text-body-strong">Filter saved!</span>
            </div>
          ) : (
            <div className="space-y-2">
              <input
                type="text"
                value={filterName}
                onChange={(e) => setFilterName(e.target.value)}
                placeholder="Filter name..."
                className="input !py-1.5 text-caption w-full"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveFilter()
                  if (e.key === 'Escape') {
                    setShowSaveDialog(false)
                    setFilterName('')
                  }
                }}
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSaveFilter}
                  disabled={!filterName.trim()}
                  className="btn-primary btn-sm flex-1"
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setShowSaveDialog(false)
                    setFilterName('')
                  }}
                  className="btn-secondary btn-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filter List */}
      <div className="flex-1 overflow-y-auto">
        {/* Account Manager */}
        <AccordionRow
          label="Account Manager"
          icon={Users}
          isExpanded={expandedSections.am}
          onToggle={() => toggleSection('am')}
          hasValue={filters.am.length > 0}
        />
        {expandedSections.am && (
          <MultiSelect
            options={filterOptions.ams}
            selected={filters.am}
            onChange={(am) => onChange({ ...filters, am })}
          />
        )}

        {/* Segment */}
        <AccordionRow
          label="Segment"
          icon={Layers}
          isExpanded={expandedSections.segment}
          onToggle={() => toggleSection('segment')}
          hasValue={filters.segment.length > 0}
        />
        {expandedSections.segment && (
          <MultiSelect
            options={filterOptions.segments}
            selected={filters.segment}
            onChange={(segment) => onChange({ ...filters, segment })}
          />
        )}

        {/* Status */}
        <AccordionRow
          label="Status"
          icon={Activity}
          isExpanded={expandedSections.status}
          onToggle={() => toggleSection('status')}
          hasValue={filters.status.length > 0}
        />
        {expandedSections.status && (
          <MultiSelect
            options={['active', 'trialing', 'past_due', 'canceled', 'churned']}
            selected={filters.status}
            onChange={(status) => onChange({ ...filters, status })}
          />
        )}

        {/* Health Score */}
        <AccordionRow
          label="Health Score"
          icon={Activity}
          isExpanded={expandedSections.health}
          onToggle={() => toggleSection('health')}
          hasValue={filters.healthMin > 0 || filters.healthMax < 100}
        />
        {expandedSections.health && (
          <RangeSlider
            min={0}
            max={100}
            minValue={filters.healthMin}
            maxValue={filters.healthMax}
            onChange={(healthMin, healthMax) => onChange({ ...filters, healthMin, healthMax })}
          />
        )}

        {/* Plan */}
        <AccordionRow
          label="Plan"
          icon={Tag}
          isExpanded={expandedSections.plan}
          onToggle={() => toggleSection('plan')}
          hasValue={filters.plan.length > 0}
        />
        {expandedSections.plan && (
          <MultiSelect
            options={filterOptions.plans}
            selected={filters.plan}
            onChange={(plan) => onChange({ ...filters, plan })}
          />
        )}

        {/* MRR Range */}
        <AccordionRow
          label="MRR Range"
          icon={DollarSign}
          isExpanded={expandedSections.mrr}
          onToggle={() => toggleSection('mrr')}
          hasValue={filters.mrrMin > 0 || filters.mrrMax < 10000}
        />
        {expandedSections.mrr && (
          <RangeSlider
            min={0}
            max={10000}
            minValue={filters.mrrMin}
            maxValue={filters.mrrMax}
            onChange={(mrrMin, mrrMax) => onChange({ ...filters, mrrMin, mrrMax })}
            prefix="$"
            step={100}
          />
        )}

        {/* Traffic Source */}
        <AccordionRow
          label="Traffic Source"
          icon={Target}
          isExpanded={expandedSections.trafficSource}
          onToggle={() => toggleSection('trafficSource')}
          hasValue={filters.trafficSource.length > 0}
        />
        {expandedSections.trafficSource && (
          <MultiSelect
            options={filterOptions.trafficSources}
            selected={filters.trafficSource}
            onChange={(trafficSource) => onChange({ ...filters, trafficSource })}
          />
        )}

        {/* Location */}
        <AccordionRow
          label="Location"
          icon={MapPin}
          isExpanded={expandedSections.location}
          onToggle={() => toggleSection('location')}
          hasValue={filters.location.length > 0}
        />
        {expandedSections.location && (
          <MultiSelect
            options={filterOptions.locations}
            selected={filters.location}
            onChange={(location) => onChange({ ...filters, location })}
          />
        )}

        {/* Industry */}
        <AccordionRow
          label="Industry"
          icon={Building2}
          isExpanded={expandedSections.industry}
          onToggle={() => toggleSection('industry')}
          hasValue={filters.industry.length > 0}
        />
        {expandedSections.industry && (
          <MultiSelect
            options={filterOptions.industries}
            selected={filters.industry}
            onChange={(industry) => onChange({ ...filters, industry })}
          />
        )}

        {/* Company Size */}
        <AccordionRow
          label="Company Size"
          icon={Briefcase}
          isExpanded={expandedSections.companySize}
          onToggle={() => toggleSection('companySize')}
          hasValue={filters.companySize.length > 0}
        />
        {expandedSections.companySize && (
          <MultiSelect
            options={filterOptions.companySizes}
            selected={filters.companySize}
            onChange={(companySize) => onChange({ ...filters, companySize })}
          />
        )}

        {/* ICP Match */}
        <AccordionRow
          label="ICP Match"
          icon={Target}
          isExpanded={expandedSections.icpMatch}
          onToggle={() => toggleSection('icpMatch')}
          hasValue={filters.icpMatch.length > 0}
        />
        {expandedSections.icpMatch && (
          <MultiSelect
            options={['Strong Match', 'Good Match', 'Partial Match', 'No Match']}
            selected={filters.icpMatch}
            onChange={(icpMatch) => onChange({ ...filters, icpMatch })}
          />
        )}

        {/* Last Seen */}
        <AccordionRow
          label="Last Seen"
          icon={Clock}
          isExpanded={expandedSections.lastSeen}
          onToggle={() => toggleSection('lastSeen')}
          hasValue={filters.lastSeen !== ''}
        />
        {expandedSections.lastSeen && (
          <div className="px-3 pb-3">
            <select
              value={filters.lastSeen}
              onChange={(e) => onChange({ ...filters, lastSeen: e.target.value })}
              className="select"
            >
              <option value="">Any time</option>
              <option value="today">Today</option>
              <option value="7days">Last 7 days</option>
              <option value="30days">Last 30 days</option>
              <option value="90days">Last 90 days</option>
              <option value="inactive">Inactive (90+ days)</option>
            </select>
          </div>
        )}
      </div>
    </div>
  )
}
