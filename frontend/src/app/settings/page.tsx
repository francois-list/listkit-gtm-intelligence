'use client'

import { useState } from 'react'
import {
  Database,
  Bell,
  Users,
  RefreshCw,
  Check,
  AlertCircle,
  Clock,
  Zap,
} from 'lucide-react'

interface DataSource {
  name: string
  status: 'connected' | 'disconnected' | 'error'
  lastSync: string | null
  icon: React.ComponentType<{ className?: string }>
}

const dataSources: DataSource[] = [
  { name: 'Intercom', status: 'connected', lastSync: '2 hours ago', icon: Zap },
  { name: 'HubSpot', status: 'disconnected', lastSync: null, icon: Database },
  { name: 'Calendly', status: 'disconnected', lastSync: null, icon: Clock },
  { name: 'Stripe', status: 'connected', lastSync: '2 hours ago', icon: Database },
]

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('data-sources')
  const [syncing, setSyncing] = useState<string | null>(null)

  const handleSync = async (sourceName: string) => {
    setSyncing(sourceName)
    await new Promise(resolve => setTimeout(resolve, 2000))
    setSyncing(null)
  }

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-title text-[var(--text)]">Settings</h1>
        <p className="text-caption text-[var(--text-muted)] mt-1">
          Configure your data sources and notification preferences
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-[var(--border)]">
        <nav className="flex gap-6">
          <button
            onClick={() => setActiveTab('data-sources')}
            className={`pb-3 text-body font-medium border-b-2 transition-colors ${
              activeTab === 'data-sources'
                ? 'border-[var(--primary)] text-[var(--primary)]'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          >
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4" />
              Data Sources
            </div>
          </button>
          <button
            onClick={() => setActiveTab('notifications')}
            className={`pb-3 text-body font-medium border-b-2 transition-colors ${
              activeTab === 'notifications'
                ? 'border-[var(--primary)] text-[var(--primary)]'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          >
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4" />
              Notifications
            </div>
          </button>
          <button
            onClick={() => setActiveTab('team')}
            className={`pb-3 text-body font-medium border-b-2 transition-colors ${
              activeTab === 'team'
                ? 'border-[var(--primary)] text-[var(--primary)]'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          >
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              Team
            </div>
          </button>
        </nav>
      </div>

      {/* Data Sources Tab */}
      {activeTab === 'data-sources' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-body-strong text-[var(--text)]">Connected Data Sources</h2>
              <p className="text-caption text-[var(--text-muted)] mt-1">
                Manage your integrations and sync settings
              </p>
            </div>
            <button className="btn-primary btn-sm">
              <RefreshCw className="w-4 h-4" />
              Sync All
            </button>
          </div>

          <div className="space-y-3">
            {dataSources.map((source) => {
              const Icon = source.icon
              return (
                <div key={source.name} className="card flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-md bg-[var(--surface-muted)] flex items-center justify-center">
                      <Icon className="w-5 h-5 text-[var(--text-muted)]" />
                    </div>
                    <div>
                      <p className="text-body-strong text-[var(--text)]">{source.name}</p>
                      <p className="text-caption text-[var(--text-muted)]">
                        {source.lastSync ? `Last synced ${source.lastSync}` : 'Not connected'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {source.status === 'connected' ? (
                      <span className="badge-success">
                        <Check className="w-3 h-3" />
                        Connected
                      </span>
                    ) : source.status === 'error' ? (
                      <span className="badge-error">
                        <AlertCircle className="w-3 h-3" />
                        Error
                      </span>
                    ) : (
                      <span className="badge-warning">Disconnected</span>
                    )}

                    {source.status === 'connected' ? (
                      <button
                        onClick={() => handleSync(source.name)}
                        disabled={syncing === source.name}
                        className="btn-secondary btn-sm"
                      >
                        <RefreshCw className={`w-4 h-4 ${syncing === source.name ? 'animate-spin' : ''}`} />
                        {syncing === source.name ? 'Syncing...' : 'Sync'}
                      </button>
                    ) : (
                      <button className="btn-primary btn-sm">Connect</button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Notifications Tab */}
      {activeTab === 'notifications' && (
        <div className="space-y-4">
          <div>
            <h2 className="text-body-strong text-[var(--text)]">Notification Preferences</h2>
            <p className="text-caption text-[var(--text-muted)] mt-1">
              Configure when and how you receive alerts
            </p>
          </div>

          <div className="card space-y-0">
            {/* Churn Risk Alerts */}
            <div className="flex items-center justify-between py-4">
              <div>
                <p className="text-body-strong text-[var(--text)]">Churn Risk Alerts</p>
                <p className="text-caption text-[var(--text-muted)]">
                  Get notified when customers show high churn risk
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" defaultChecked className="sr-only peer" />
                <div className="w-11 h-6 bg-[var(--surface-muted)] peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[var(--primary)] rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-[var(--border)] after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--primary)]" />
              </label>
            </div>

            <div className="divider" />

            {/* Health Drop Alerts */}
            <div className="flex items-center justify-between py-4">
              <div>
                <p className="text-body-strong text-[var(--text)]">Health Score Drops</p>
                <p className="text-caption text-[var(--text-muted)]">
                  Get notified when health score drops significantly
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" defaultChecked className="sr-only peer" />
                <div className="w-11 h-6 bg-[var(--surface-muted)] peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[var(--primary)] rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-[var(--border)] after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--primary)]" />
              </label>
            </div>

            <div className="divider" />

            {/* Daily Digest */}
            <div className="flex items-center justify-between py-4">
              <div>
                <p className="text-body-strong text-[var(--text)]">Daily Digest</p>
                <p className="text-caption text-[var(--text-muted)]">
                  Receive a daily summary of customer health
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" />
                <div className="w-11 h-6 bg-[var(--surface-muted)] peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[var(--primary)] rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-[var(--border)] after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--primary)]" />
              </label>
            </div>

            <div className="divider" />

            {/* Slack Notifications */}
            <div className="flex items-center justify-between py-4">
              <div>
                <p className="text-body-strong text-[var(--text)]">Slack Notifications</p>
                <p className="text-caption text-[var(--text-muted)]">
                  Send notifications to your Slack workspace
                </p>
              </div>
              <button className="btn-secondary btn-sm">Configure</button>
            </div>
          </div>
        </div>
      )}

      {/* Team Tab */}
      {activeTab === 'team' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-body-strong text-[var(--text)]">Account Managers</h2>
              <p className="text-caption text-[var(--text-muted)] mt-1">
                Manage your team members and their assignments
              </p>
            </div>
            <button className="btn-primary btn-sm">Add AM</button>
          </div>

          <div className="table-container">
            <table className="w-full">
              <thead>
                <tr className="table-header">
                  <th className="text-left">Name</th>
                  <th className="text-left">Email</th>
                  <th className="text-right">Customers</th>
                  <th className="text-right">MRR</th>
                  <th className="text-right">Avg Health</th>
                </tr>
              </thead>
              <tbody>
                <tr className="table-row">
                  <td className="py-2 px-3 text-body-strong text-[var(--text)]">François Bonja</td>
                  <td className="py-2 px-3 text-body text-[var(--text-muted)]">francois@listkit.io</td>
                  <td className="py-2 px-3 text-right text-body text-[var(--text)]">—</td>
                  <td className="py-2 px-3 text-right text-body text-[var(--text)]">—</td>
                  <td className="py-2 px-3 text-right text-body text-[var(--text)]">—</td>
                </tr>
                <tr>
                  <td colSpan={5} className="py-8">
                    <div className="empty-state">
                      <Users className="w-8 h-8 mb-2" />
                      <p className="text-body">No other team members added yet</p>
                      <p className="text-caption mt-1">Add account managers to assign customers</p>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
