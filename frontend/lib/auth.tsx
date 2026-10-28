"use client"

import type React from "react"

import { useState, useEffect, createContext, useContext } from "react"
import * as authApi from "@/lib/api/auth"
import { ApiError } from "@/lib/api/client"
import { reconnectSocketWithAuth } from "@/lib/socket"

export interface User {
  id: number
  email: string
  full_name: string
  first_name: string
  last_name: string
  phone?: string
  date_of_birth?: string
  role: "user" | "cinema_manager" | "admin"
  is_admin: boolean
  is_cinema_manager: boolean
  can_access_admin: boolean
  can_manage_users: boolean
  /** Rạp mà quản lý chi nhánh phụ trách (null với admin/user). */
  cinema_id?: number | null
  cinema_name?: string | null
  google_id?: string | null
  is_google_account: boolean
}

interface AuthContextType {
  user: User | null
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>
  register: (userData: RegisterData) => Promise<{ success: boolean; error?: string; errors?: Array<string | { field: string; message: string }> }>
  sendRegistrationCode: (email: string) => Promise<{ success: boolean; error?: string }>
  logout: () => Promise<void>
  loading: boolean
}

interface RegisterData {
  email: string
  password: string
  first_name: string
  last_name: string
  phone?: string
  date_of_birth?: string
  code: string
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const normalizeRole = (role?: string, isAdmin?: boolean): User["role"] => {
  if (role === "admin" || role === "cinema_manager" || role === "user") {
    return role
  }
  return isAdmin ? "admin" : "user"
}

// Tách full_name (tên thật người dùng nhập lúc đăng ký) thành first_name/last_name
// để tương thích với các nơi trong UI đang dùng 2 field riêng. Nếu chưa có full_name
// (tài khoản cũ trước khi có cột này, hoặc tài khoản Google chưa đồng bộ), fallback
// về username thay vì để trống.
const splitFullName = (fullName?: string | null, fallbackUsername?: string): { first_name: string; last_name: string } => {
  const name = (fullName || fallbackUsername || "").trim()
  if (!name) return { first_name: "", last_name: "" }
  const parts = name.split(/\s+/)
  return { first_name: parts[0] || "", last_name: parts.slice(1).join(" ") || "" }
}

const buildUserWithPermissions = (user: Omit<User, "is_admin" | "is_cinema_manager" | "can_access_admin" | "can_manage_users" | "is_google_account">): User => {
  const isAdmin = user.role === "admin"
  const isCinemaManager = user.role === "cinema_manager"
  return {
    ...user,
    is_admin: isAdmin,
    is_cinema_manager: isCinemaManager,
    can_access_admin: isAdmin || isCinemaManager,
    can_manage_users: isAdmin,
    is_google_account: !!(user.google_id),
  }
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const init = async () => {
      try {
        // Use sessionStorage (per-tab) so multiple tabs can have different accounts logged in
        const token = sessionStorage.getItem("auth_token") || localStorage.getItem("auth_token")
        const userData = sessionStorage.getItem("user_data") || localStorage.getItem("user_data")

        if (token && userData) {
          const parsedUser = JSON.parse(userData)
          // Verify token with backend to prevent stale auto-login, and refresh
          // profile data (full_name/role có thể đã đổi từ lần đăng nhập trước,
          // ví dụ admin đổi role hoặc user cập nhật hồ sơ ở tab khác)
          const freshProfile = await authApi.getProfile().catch(() => null)

          if (freshProfile) {
            const { first_name, last_name } = splitFullName(freshProfile.full_name, freshProfile.username)
            const normalizedUser = buildUserWithPermissions({
              id: freshProfile.id,
              email: freshProfile.email,
              full_name: freshProfile.full_name || "",
              first_name,
              last_name,
              phone: freshProfile.phone ?? parsedUser.phone,
              date_of_birth: freshProfile.date_of_birth ?? parsedUser.date_of_birth,
              role: normalizeRole(freshProfile.role, freshProfile.is_admin),
              google_id: freshProfile.google_id || null,
              cinema_id: (freshProfile as any).cinema_id ?? null,
              cinema_name: (freshProfile as any).cinema_name ?? null,
            })

            // Migrate to sessionStorage if found in localStorage
            sessionStorage.setItem("auth_token", token)
            sessionStorage.setItem("user_data", JSON.stringify(normalizedUser))
            localStorage.removeItem("auth_token")
            localStorage.removeItem("user_data")
            setUser(normalizedUser)
          } else {
            sessionStorage.removeItem("auth_token")
            sessionStorage.removeItem("user_data")
            localStorage.removeItem("auth_token")
            localStorage.removeItem("user_data")
            setUser(null)
          }
        } else {
          // No valid session
          sessionStorage.removeItem("auth_token")
          sessionStorage.removeItem("user_data")
          setUser(null)
        }
      } catch (error) {
        sessionStorage.removeItem("auth_token")
        sessionStorage.removeItem("user_data")
        localStorage.removeItem("auth_token")
        localStorage.removeItem("user_data")
        setUser(null)
      } finally {
        setLoading(false)
      }
    }
    void init()
  }, [])

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const data = await authApi.login(email, password)
      const { first_name, last_name } = splitFullName(data.user.full_name, data.user.username)
      const user = buildUserWithPermissions({
        id: data.user.id,
        email: data.user.email,
        full_name: data.user.full_name || "",
        first_name,
        last_name,
        role: normalizeRole(data.user.role),
        google_id: data.user.google_id || null,
      })

      // Use sessionStorage so each tab can have different accounts
      sessionStorage.setItem("auth_token", data.token)
      sessionStorage.setItem("user_data", JSON.stringify(user))
      setUser(user)
      reconnectSocketWithAuth()

      return { success: true }
    } catch (error) {
      console.error("Login error:", error)
      const message = error instanceof ApiError ? error.message : "Network error. Please try again."
      return { success: false, error: message }
    }
  }

  const register = async (userData: RegisterData): Promise<{ 
    success: boolean; 
    error?: string; 
    errors?: Array<string | { field: string; message: string }> 
  }> => {
    try {
      // Generate valid username from email (part before @)
      const username = userData.email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '_')

      const data = await authApi.register({
        username,
        full_name: `${userData.first_name} ${userData.last_name}`,
        email: userData.email,
        password: userData.password,
        phone: userData.phone || undefined,
        date_of_birth: userData.date_of_birth || undefined,
        code: userData.code,
      })

      const user = buildUserWithPermissions({
        id: data.user.id,
        email: data.user.email,
        full_name: data.user.full_name || `${userData.first_name} ${userData.last_name}`.trim(),
        first_name: userData.first_name,
        last_name: userData.last_name,
        phone: userData.phone,
        date_of_birth: data.user.date_of_birth || userData.date_of_birth,
        role: normalizeRole(data.user.role),
        google_id: null,
      })

      // Use sessionStorage so each tab can have different accounts
      sessionStorage.setItem("auth_token", data.token)
      sessionStorage.setItem("user_data", JSON.stringify(user))
      setUser(user)
      reconnectSocketWithAuth()

      return { success: true }
    } catch (error) {
      console.error("Registration error:", error)
      if (error instanceof ApiError) {
        return {
          success: false,
          error: error.message || "Đăng ký thất bại",
          errors: (error.details as any)?.errors || [],
        }
      }
      return { success: false, error: "Lỗi kết nối. Vui lòng thử lại." }
    }
  }

  const sendRegistrationCode = async (email: string): Promise<{ success: boolean; error?: string }> => {
    try {
      await authApi.sendRegistrationCode(email)
      return { success: true }
    } catch (error) {
      console.error("Send registration code error:", error)
      const message = error instanceof ApiError ? error.message : "Lỗi kết nối. Vui lòng thử lại."
      return { success: false, error: message }
    }
  }

  const logout = async () => {
    try {
      const token = sessionStorage.getItem("auth_token") || localStorage.getItem("auth_token")
      if (token) {
        await authApi.logout()
      }
    } catch (error) {
      console.error("Logout error:", error)
    } finally {
      // Clear both storages and user state
      sessionStorage.removeItem("auth_token")
      sessionStorage.removeItem("user_data")
      localStorage.removeItem("auth_token")
      localStorage.removeItem("user_data")
      setUser(null)
      reconnectSocketWithAuth()
    }
  }

  return <AuthContext.Provider value={{ user, login, register, sendRegistrationCode, logout, loading }}>{children}</AuthContext.Provider>
}
