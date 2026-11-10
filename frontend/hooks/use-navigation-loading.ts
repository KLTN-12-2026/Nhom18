'use client'

import { useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

/**
 * Hook to show loading state during navigation
 * Triggers a CSS class on body element during route transitions
 */
export function useNavigationLoading() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    // Remove loading class when navigation completes
    document.body.classList.remove('page-loading')
  }, [pathname, searchParams])

  useEffect(() => {
    // Add loading class when user clicks on links
    const handleLinkClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const link = target.closest('a')
      
      if (link && link.href && !link.target && !link.download) {
        const url = new URL(link.href)
        // Only show loading for internal links
        if (url.origin === window.location.origin && url.pathname !== pathname) {
          document.body.classList.add('page-loading')
        }
      }
    }

    document.addEventListener('click', handleLinkClick)
    return () => document.removeEventListener('click', handleLinkClick)
  }, [pathname])
}
