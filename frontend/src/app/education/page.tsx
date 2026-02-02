'use client'

import { useState } from 'react'
import {
  GraduationCap,
  Mail,
  Users,
  TrendingUp,
  Play,
  Clock,
  Search,
  BookOpen,
} from 'lucide-react'

interface VideoCategory {
  id: string
  name: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  color: string
}

interface Video {
  id: string
  title: string
  description: string
  category: string
  duration: string
  thumbnail?: string
}

const categories: VideoCategory[] = [
  {
    id: 'cold-email',
    name: 'Cold Email',
    description: 'Master the art of cold outreach and email campaigns',
    icon: Mail,
    color: 'bg-blue-100 text-blue-600',
  },
  {
    id: 'customer-experience',
    name: 'Customer Experience',
    description: 'Learn how to deliver exceptional customer support',
    icon: Users,
    color: 'bg-green-100 text-green-600',
  },
  {
    id: 'sales',
    name: 'Sales',
    description: 'Improve your sales skills and close more deals',
    icon: TrendingUp,
    color: 'bg-purple-100 text-purple-600',
  },
]

// Placeholder videos - will be replaced with real content
const videos: Video[] = []

export default function EducationPage() {
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const filteredVideos = videos.filter((video) => {
    const matchesCategory = !activeCategory || video.category === activeCategory
    const matchesSearch =
      !searchQuery ||
      video.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      video.description.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesCategory && matchesSearch
  })

  return (
    <div className="p-4 lg:p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-lg bg-[var(--primary-light)] flex items-center justify-center">
            <GraduationCap className="w-5 h-5 text-[var(--primary)]" />
          </div>
          <div>
            <h1 className="text-title text-[var(--text)]">Education Center</h1>
            <p className="text-caption text-[var(--text-muted)]">
              Training videos for the ListKit team
            </p>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
        <input
          type="text"
          placeholder="Search videos..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
        />
      </div>

      {/* Category Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {categories.map((category) => {
          const Icon = category.icon
          const isActive = activeCategory === category.id
          const videoCount = videos.filter((v) => v.category === category.id).length

          return (
            <button
              key={category.id}
              onClick={() => setActiveCategory(isActive ? null : category.id)}
              className={`card text-left transition-all ${
                isActive
                  ? 'ring-2 ring-[var(--primary)] bg-[var(--primary-light)]'
                  : 'hover:shadow-md'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${category.color}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <h3 className="text-body-strong text-[var(--text)]">{category.name}</h3>
                  <p className="text-caption text-[var(--text-muted)] mt-1">
                    {category.description}
                  </p>
                  <p className="text-caption text-[var(--text-muted)] mt-2">
                    {videoCount} {videoCount === 1 ? 'video' : 'videos'}
                  </p>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Videos Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-body-strong text-[var(--text)]">
            {activeCategory
              ? categories.find((c) => c.id === activeCategory)?.name + ' Videos'
              : 'All Videos'}
          </h2>
          {activeCategory && (
            <button
              onClick={() => setActiveCategory(null)}
              className="text-caption text-[var(--primary)] hover:underline"
            >
              View all
            </button>
          )}
        </div>

        {filteredVideos.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredVideos.map((video) => (
              <div key={video.id} className="card hover:shadow-md transition-shadow cursor-pointer">
                {/* Video Thumbnail */}
                <div className="aspect-video bg-[var(--surface-muted)] rounded-lg mb-3 flex items-center justify-center relative group">
                  {video.thumbnail ? (
                    <img
                      src={video.thumbnail}
                      alt={video.title}
                      className="w-full h-full object-cover rounded-lg"
                    />
                  ) : (
                    <Play className="w-10 h-10 text-[var(--text-muted)]" />
                  )}
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                    <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center">
                      <Play className="w-6 h-6 text-[var(--text)] ml-1" />
                    </div>
                  </div>
                </div>

                {/* Video Info */}
                <h3 className="text-body-strong text-[var(--text)] line-clamp-2">
                  {video.title}
                </h3>
                <p className="text-caption text-[var(--text-muted)] mt-1 line-clamp-2">
                  {video.description}
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <Clock className="w-3 h-3 text-[var(--text-muted)]" />
                  <span className="text-caption text-[var(--text-muted)]">{video.duration}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Empty State */
          <div className="card">
            <div className="empty-state py-12">
              <BookOpen className="w-12 h-12 mb-4 text-[var(--text-muted)]" />
              <h3 className="text-body-strong text-[var(--text)] mb-2">
                No videos available yet
              </h3>
              <p className="text-body text-[var(--text-muted)] max-w-md mx-auto">
                Training videos about cold email, customer experience, and sales will be added here soon.
                Check back later for new content!
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Coming Soon Section */}
      <div className="card bg-gradient-to-r from-[var(--primary-light)] to-[var(--surface)]">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-[var(--primary)] flex items-center justify-center">
            <GraduationCap className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="text-body-strong text-[var(--text)]">More content coming soon!</h3>
            <p className="text-caption text-[var(--text-muted)] mt-1">
              We're working on adding training videos to help you master cold email,
              customer experience, and sales techniques.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
