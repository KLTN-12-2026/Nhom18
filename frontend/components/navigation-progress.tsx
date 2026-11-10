'use client'

import { useEffect, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'

export function NavigationProgress() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    // Complete loading when navigation finishes
    setLoading(false)
    setProgress(100)
    
    const timer = setTimeout(() => {
      setProgress(0)
    }, 500)
    
    return () => clearTimeout(timer)
  }, [pathname, searchParams])

  useEffect(() => {
    // Detect clicks on links to show loading
    const handleLinkClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const link = target.closest('a')
      
      if (link && link.href && !link.target && !link.download) {
        const url = new URL(link.href)
        // Only show loading for internal links
        if (url.origin === window.location.origin && url.pathname !== pathname) {
          setLoading(true)
          setProgress(0)
          
          // Simulate progress
          let currentProgress = 0
          const interval = setInterval(() => {
            currentProgress += Math.random() * 10
            if (currentProgress >= 90) {
              currentProgress = 90
              clearInterval(interval)
            }
            setProgress(currentProgress)
          }, 200)
        }
      }
    }

    document.addEventListener('click', handleLinkClick, true)
    return () => document.removeEventListener('click', handleLinkClick, true)
  }, [pathname])

  if (!loading && progress === 0) return null

  return (
    <>
      <div className="fixed top-0 left-0 right-0 z-[9999] h-1 bg-primary/10">
        <div 
          className="h-full bg-gradient-to-r from-primary via-blue-500 to-purple-500 transition-all duration-200 ease-out" 
          style={{ width: `${progress}%` }}
        />
      </div>
      {loading && (
        <div className="fixed top-2 right-4 z-[9999] flex items-center gap-2 bg-background/80 backdrop-blur-sm border border-border rounded-full px-3 py-1.5 shadow-lg">
          <div className="relative w-4 h-4">
            <div className="absolute inset-0 border-2 border-primary/30 rounded-full" />
            <div className="absolute inset-0 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
          <span className="text-xs text-muted-foreground">Đang tải...</span>
        </div>
      )}
    </>
  )
}

// Global loading overlay for when data is fetching
export function GlobalLoadingOverlay({ show }: { show: boolean }) {
  if (!show) return null

  return (
    <div className="fixed inset-0 z-[9998] bg-background/80 backdrop-blur-sm flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Đang tải...</p>
      </div>
    </div>
  )
}

