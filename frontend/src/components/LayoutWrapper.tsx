'use client'

import { useState, useEffect, createContext, useContext } from 'react'
import Sidebar from './Sidebar'

interface LayoutContextType {
  sidebarCollapsed: boolean
  toggleSidebar: () => void
}

const LayoutContext = createContext<LayoutContextType>({
  sidebarCollapsed: false,
  toggleSidebar: () => {},
})

export function useLayout() {
  return useContext(LayoutContext)
}

export default function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mounted, setMounted] = useState(false)

  // Load saved state from localStorage
  useEffect(() => {
    setMounted(true)
    const saved = localStorage.getItem('sidebar-collapsed')
    if (saved !== null) {
      setSidebarCollapsed(saved === 'true')
    }
  }, [])

  const toggleSidebar = () => {
    const newValue = !sidebarCollapsed
    setSidebarCollapsed(newValue)
    localStorage.setItem('sidebar-collapsed', String(newValue))
  }

  // Prevent hydration mismatch
  if (!mounted) {
    return (
      <div className="flex h-screen overflow-hidden bg-[var(--bg)]">
        <div className="w-60 flex-shrink-0" />
        <main className="flex-1 ml-60 bg-[var(--surface)] overflow-y-auto">{children}</main>
      </div>
    )
  }

  return (
    <LayoutContext.Provider value={{ sidebarCollapsed, toggleSidebar }}>
      <div className="flex h-screen overflow-hidden bg-[var(--bg)]">
        <Sidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
        <main
          className={`flex-1 transition-all duration-300 ease-in-out bg-[var(--surface)] overflow-y-auto ${
            sidebarCollapsed ? 'ml-16' : 'ml-60'
          }`}
        >
          {children}
        </main>
      </div>
    </LayoutContext.Provider>
  )
}
