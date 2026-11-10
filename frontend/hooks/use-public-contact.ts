"use client"

import { useEffect, useState } from "react"
import { getPublicContact, type PublicContact } from "@/lib/api/settings"

/** Email/tổng đài lấy từ trang Cài đặt của admin (GET /api/settings/public). null khi đang tải. */
export function usePublicContact(): PublicContact | null {
  const [contact, setContact] = useState<PublicContact | null>(null)

  useEffect(() => {
    let active = true
    getPublicContact()
      .then((c) => { if (active) setContact(c) })
      .catch(() => {})
    return () => { active = false }
  }, [])

  return contact
}
