'use client'

import { useState, useEffect, createContext, useContext } from 'react'
import Sidebar from './Sidebar'

interface LayoutContextType {
  sidebarCollapsed: boolean
  toggleSidebar: () => void
  theme: 'light' | 'dark'
  toggleTheme: () => void
}

const LayoutContext = createContext<LayoutContextType>({
  sidebarCollapsed: false,
  toggleSidebar: () => {},
  theme: 'light',
  toggleTheme: () => {},
})

export function useLayout() {
  return useContext(LayoutContext)
}

export function useTheme() {
  const { theme, toggleTheme } = useContext(LayoutContext)
  return { theme, toggleTheme }
}

export default function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [mounted, setMounted] = useState(false)

  // Load saved state from localStorage
  useEffect(() => {
    setMounted(true)
    const savedSidebar = localStorage.getItem('sidebar-collapsed')
    if (savedSidebar !== null) {
      setSidebarCollapsed(savedSidebar === 'true')
    }

    // Load theme preference
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null
    if (savedTheme) {
      setTheme(savedTheme)
      document.documentElement.classList.toggle('dark', savedTheme === 'dark')
    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setTheme('dark')
      document.documentElement.classList.add('dark')
    }
  }, [])

  const toggleSidebar = () => {
    const newValue = !sidebarCollapsed
    setSidebarCollapsed(newValue)
    localStorage.setItem('sidebar-collapsed', String(newValue))
  }

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light'
    setTheme(newTheme)
    localStorage.setItem('theme', newTheme)
    document.documentElement.classList.toggle('dark', newTheme === 'dark')
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
    <LayoutContext.Provider value={{ sidebarCollapsed, toggleSidebar, theme, toggleTheme }}>
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
