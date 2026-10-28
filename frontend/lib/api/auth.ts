import { apiFetch } from "./client"

export async function getProfile(): Promise<any> {
  const data = await apiFetch<{ user: any }>("/api/auth/profile")
  return data.user
}

export async function login(email: string, password: string): Promise<{ token: string; user: any }> {
  return apiFetch("/api/auth/login", { method: "POST", auth: false, body: JSON.stringify({ email, password }) })
}

export async function register(input: {
  username: string
  full_name: string
  email: string
  password: string
  phone?: string
  date_of_birth?: string
  code: string
}): Promise<{ token: string; user: any; errors?: any[] }> {
  return apiFetch("/api/auth/register", { method: "POST", auth: false, body: JSON.stringify(input) })
}

export async function sendRegistrationCode(email: string): Promise<void> {
  await apiFetch("/api/auth/register/send-code", { method: "POST", auth: false, body: JSON.stringify({ email }) })
}

export async function logout(): Promise<void> {
  await apiFetch("/api/auth/logout", { method: "POST" })
}

export async function forgotPassword(email: string): Promise<void> {
  await apiFetch("/api/auth/forgot-password", { method: "POST", auth: false, body: JSON.stringify({ email }) })
}

export async function resetPassword(email: string, resetCode: string, newPassword: string): Promise<void> {
  await apiFetch("/api/auth/reset-password", {
    method: "POST", auth: false,
    body: JSON.stringify({ email, resetCode, newPassword }),
  })
}

export async function updateProfile(input: { username: string; email: string; phone?: string; date_of_birth?: string; full_name?: string; currentPassword?: string }): Promise<void> {
  await apiFetch("/api/auth/profile", { method: "PUT", body: JSON.stringify(input) })
}

// Đổi mã trao đổi (từ redirect OAuth) lấy JWT thật — token không còn nằm
// trực tiếp trên URL nữa (xem authController.js googleCallback/exchangeGoogleCode).
export async function exchangeGoogleCode(code: string): Promise<{ token: string }> {
  return apiFetch("/api/auth/google/exchange", { method: "POST", auth: false, body: JSON.stringify({ code }) })
}

export async function sendChangePasswordCode(currentPassword: string): Promise<void> {
  await apiFetch("/api/auth/change-password/send-code", { method: "POST", body: JSON.stringify({ currentPassword }) })
}

export async function changePassword(input: { currentPassword: string; newPassword: string; code: string }): Promise<void> {
  await apiFetch("/api/auth/change-password", { method: "PUT", body: JSON.stringify(input) })
}
