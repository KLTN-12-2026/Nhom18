import type React from "react"
import type { Metadata } from "next"
import { GeistSans } from "geist/font/sans"
import { GeistMono } from "geist/font/mono"
import { Analytics } from "@vercel/analytics/next"
import { Suspense } from "react"
import { AuthProvider } from "@/lib/auth"
import { ThemeProvider } from "@/components/theme-provider"
import { ToastProvider } from "@/components/toast-provider"
import { MobileBottomNav } from "@/components/mobile-bottom-nav"
import { Footer } from "@/components/footer"
import { QuickActions } from "@/components/quick-actions"
import { NotificationPopup } from "@/components/notification-popup"
import { LoadingSpinner } from "@/components/loading-spinner"
import { NavigationProgress } from "@/components/navigation-progress"
import "./globals.css"

export const metadata: Metadata = {
  title: "CinemaGold - Đặt vé phim cao cấp",
  description: "Đặt vé cho những bộ phim yêu thích tại các rạp tốt nhất",
  generator: "v0.app",
  other: {
    'theme-color': '#000000',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <head>
        {/* Preconnect to API server for faster requests */}
        <link rel="preconnect" href={process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000"} />
        <link rel="dns-prefetch" href={process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000"} />
      </head>
      <body suppressHydrationWarning className={`font-sans ${GeistSans.variable} ${GeistMono.variable} antialiased pb-16 md:pb-0 flex flex-col min-h-screen`}>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
          <Suspense fallback={null}>
            <NavigationProgress />
          </Suspense>
          <AuthProvider>
            <div className="flex-1 flex flex-col">
              <Suspense fallback={
                <div className="min-h-screen flex items-center justify-center">
                  <LoadingSpinner size="lg" text="Đang tải trang..." />
                </div>
              }>
                {children}
              </Suspense>
              <Footer />
            </div>
            <MobileBottomNav />
            <QuickActions />
            <NotificationPopup />
          </AuthProvider>
          <ToastProvider />
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  )
}
