'use client'

import { useEffect, useState } from 'react'

interface LoadingSpinnerProps {
  /** Show simulated progress percentage */
  showProgress?: boolean
  /** Custom message to display under the spinner */
  message?: string
  /** Size of the spinner: 'sm', 'md', 'lg' */
  size?: 'sm' | 'md' | 'lg'
}

export function LoadingSpinner({
  showProgress = true,
  message = 'Loading',
  size = 'md'
}: LoadingSpinnerProps) {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    if (!showProgress) return

    // Simulate progress that slows down as it approaches 100%
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 95) return prev // Cap at 95% until actual load completes
        // Faster at start, slower as it progresses
        const increment = Math.max(1, Math.floor((100 - prev) / 10))
        return Math.min(95, prev + increment)
      })
    }, 200)

    return () => clearInterval(interval)
  }, [showProgress])

  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-12 h-12',
    lg: 'w-16 h-16',
  }

  const strokeWidth = {
    sm: 3,
    md: 3,
    lg: 4,
  }

  const textSize = {
    sm: 'text-caption',
    md: 'text-body',
    lg: 'text-body-strong',
  }

  const radius = size === 'lg' ? 28 : size === 'md' ? 20 : 14
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (progress / 100) * circumference

  return (
    <div className="flex flex-col items-center justify-center gap-3">
      <div className={`relative ${sizeClasses[size]}`}>
        {/* Background circle */}
        <svg className="w-full h-full -rotate-90" viewBox="0 0 64 64">
          <circle
            cx="32"
            cy="32"
            r={radius}
            fill="none"
            stroke="var(--surface-muted)"
            strokeWidth={strokeWidth[size]}
          />
          {/* Progress circle */}
          <circle
            cx="32"
            cy="32"
            r={radius}
            fill="none"
            stroke="var(--primary)"
            strokeWidth={strokeWidth[size]}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-200 ease-out"
          />
        </svg>

        {/* Percentage in center */}
        {showProgress && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`${size === 'sm' ? 'text-[10px]' : 'text-caption'} font-semibold text-[var(--text)]`}>
              {progress}%
            </span>
          </div>
        )}
      </div>

      {/* Loading text */}
      <p className={`${textSize[size]} text-[var(--text-muted)] animate-pulse`}>
        {message}
      </p>
    </div>
  )
}

// Full page loading overlay
export function LoadingOverlay({
  message = 'Loading',
  showProgress = true
}: LoadingSpinnerProps) {
  return (
    <div className="flex items-center justify-center min-h-[400px] h-full w-full">
      <LoadingSpinner message={message} showProgress={showProgress} size="lg" />
    </div>
  )
}

export default LoadingSpinner
