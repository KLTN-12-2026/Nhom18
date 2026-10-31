"use client"

export const dynamic = "force-dynamic"

import { AdminSidebar } from "@/components/admin-sidebar"
import { AdminMoviesTable } from "@/components/admin-movies-table"
import { useRequireAdmin } from "@/hooks/use-require-admin"

export default function AdminMoviesPage() {
  const { user, loading, forbidden } = useRequireAdmin()

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  if (forbidden) {
    return <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">Không có quyền truy cập</div>
  }
  if (!user || !user.can_access_admin) {
    return null
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="flex">
        <AdminSidebar />

        <main className="flex-1 lg:ml-0 p-6 lg:p-8">
          <div className="max-w-7xl mx-auto">
            <AdminMoviesTable />
          </div>
        </main>
      </div>
    </div>
  )
}
