'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import {
  LayoutDashboard,
  Users,
  Settings,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  MessageSquare,
  Sparkles,
  BarChart3,
  HeartPulse,
  ExternalLink,
  Slack,
  GraduationCap,
  Zap,
} from 'lucide-react'

interface NavItem {
  name: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  badge?: string
}

interface NavGroup {
  label: string
  icon: React.ComponentType<{ className?: string }>
  items: NavItem[]
  defaultExpanded?: boolean
}

// Main navigation structure
const navGroups: NavGroup[] = [
  {
    label: 'Intelligence',
    icon: HeartPulse,
    defaultExpanded: true,
    items: [
      { name: 'Dashboard', href: '/', icon: LayoutDashboard },
      { name: 'Customers', href: '/customers', icon: Users },
      { name: 'Analytics', href: '/analytics', icon: BarChart3 },
    ],
  },
  {
    label: 'AI Tools',
    icon: Sparkles,
    defaultExpanded: true,
    items: [
      { name: 'AI Assistant', href: '/assistant', icon: MessageSquare, badge: 'NEW' },
    ],
  },
]

const singleNavItems: NavItem[] = [
  { name: 'Settings', href: '/settings', icon: Settings },
]

const secondaryLinks: NavItem[] = [
  { name: 'ListKit Platform', href: 'https://app.listkit.io', icon: ExternalLink },
  { name: 'Education', href: '#', icon: GraduationCap },
  { name: 'Join Slack Community', href: '#', icon: Slack },
]

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname()
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {}
    navGroups.forEach((group) => {
      initial[group.label] = group.defaultExpanded ?? false
    })
    return initial
  })

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/'
    return pathname.startsWith(href)
  }

  const toggleGroup = (label: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [label]: !prev[label],
    }))
  }

  return (
    <aside
      className={`fixed left-0 top-0 h-screen bg-[var(--bg)] border-r border-[var(--border)] flex flex-col transition-all duration-300 ease-in-out z-20 ${
        collapsed ? 'w-16' : 'w-60'
      }`}
    >
      {/* Logo Section */}
      <div className={`flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] ${collapsed ? 'p-3' : 'px-4 py-3'}`}>
        {collapsed ? (
          <div className="w-full flex justify-center">
            <img
              src="/listkit-icon.png"
              alt="ListKit"
              className="w-8 h-8 object-contain"
            />
          </div>
        ) : (
          <>
            <img
              src="/listkit-logo.png"
              alt="ListKit"
              className="h-7 object-contain"
            />
            <button
              onClick={onToggle}
              className="btn-icon !w-7 !h-7"
              title="Collapse sidebar"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </>
        )}
      </div>

      {/* Product Label (when expanded) */}
      {!collapsed && (
        <div className="px-4 py-3">
          <span className="section-label">Command Center</span>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-2">
        {/* Collapsible Groups */}
        {navGroups.map((group) => {
          const GroupIcon = group.icon
          const isExpanded = expandedGroups[group.label]

          return (
            <div key={group.label} className="mb-1">
              {/* Group Header */}
              {!collapsed ? (
                <button
                  onClick={() => toggleGroup(group.label)}
                  className="w-full flex items-center justify-between px-4 py-2 text-body-strong text-[var(--text)] hover:bg-[var(--surface-muted)] transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <GroupIcon className="w-4 h-4 text-[var(--text-muted)]" />
                    <span>{group.label}</span>
                  </div>
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />
                  )}
                </button>
              ) : null}

              {/* Group Items */}
              {(isExpanded || collapsed) && (
                <ul className={`${collapsed ? 'px-2' : 'px-2 ml-2'}`}>
                  {group.items.map((item) => {
                    const Icon = item.icon
                    const active = isActive(item.href)
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          title={collapsed ? item.name : undefined}
                          className={`flex items-center gap-3 px-3 py-2 rounded-sm text-body transition-colors ${
                            active
                              ? 'bg-[var(--primary-light)] text-[var(--primary)] font-medium'
                              : 'text-[var(--text)] hover:bg-[var(--surface-muted)]'
                          } ${collapsed ? 'justify-center' : ''}`}
                        >
                          <Icon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-[var(--primary)]' : 'text-[var(--text-muted)]'}`} />
                          {!collapsed && (
                            <span className="flex-1">{item.name}</span>
                          )}
                          {!collapsed && item.badge && (
                            <span className="badge-info text-[10px] px-1.5 py-0.5">
                              {item.badge}
                            </span>
                          )}
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )
        })}

        {/* Single Nav Items */}
        <ul className="px-2 mt-2 pt-2 border-t border-[var(--border)]">
          {singleNavItems.map((item) => {
            const Icon = item.icon
            const active = isActive(item.href)
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  title={collapsed ? item.name : undefined}
                  className={`flex items-center gap-3 px-3 py-2 rounded-sm text-body transition-colors ${
                    active
                      ? 'bg-[var(--primary-light)] text-[var(--primary)] font-medium'
                      : 'text-[var(--text)] hover:bg-[var(--surface-muted)]'
                  } ${collapsed ? 'justify-center' : ''}`}
                >
                  <Icon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-[var(--primary)]' : 'text-[var(--text-muted)]'}`} />
                  {!collapsed && <span>{item.name}</span>}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Plan Card (only when expanded) */}
      {!collapsed && (
        <div className="px-3 pb-3">
          <div className="plan-card">
            <p className="text-body-strong text-[var(--text)]">GTM Intelligence</p>
            <p className="text-caption text-[var(--text-muted)] mt-1">
              Internal customer health & analytics platform.
            </p>
            <button className="btn-primary-soft btn-sm w-full mt-3">
              <Zap className="w-3 h-3" />
              Sync Data
            </button>
          </div>
        </div>
      )}

      {/* Secondary Links (only when expanded) */}
      {!collapsed && (
        <div className="px-2 py-2 border-t border-[var(--border)]">
          {secondaryLinks.map((item) => {
            const Icon = item.icon
            return (
              <a
                key={item.name}
                href={item.href}
                target={item.href.startsWith('http') ? '_blank' : undefined}
                rel={item.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                className="flex items-center gap-3 px-3 py-2 rounded-sm text-body text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text)] transition-colors"
              >
                <Icon className="w-4 h-4" />
                <span className="flex-1">{item.name}</span>
                {item.href.startsWith('http') && (
                  <ExternalLink className="w-3 h-3" />
                )}
              </a>
            )
          })}
        </div>
      )}

      {/* User Profile */}
      <div className={`py-3 border-t border-[var(--border)] ${collapsed ? 'px-2' : 'px-3'}`}>
        <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3'}`}>
          <div className="avatar avatar-md bg-red-100 text-red-600 flex-shrink-0">
            FL
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-body-strong text-[var(--text)] truncate">François Listkit</p>
              <p className="text-caption text-[var(--text-muted)] truncate">Head of GTM</p>
            </div>
          )}
        </div>
      </div>

      {/* Toggle Button (when collapsed) */}
      {collapsed && (
        <div className="px-2 pb-3">
          <button
            onClick={onToggle}
            className="btn-icon w-full"
            title="Expand sidebar"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </aside>
  )
}
