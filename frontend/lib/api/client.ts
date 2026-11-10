import { cachedFetch } from "@/lib/fetch-cache"

const BASE_URL = (process.env.NEXT_PUBLIC_API_URL as string) || "http://localhost:5000"

export class ApiError extends Error {
  status: number
  details?: unknown

  constructor(status: number, message: string, details?: unknown) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.details = details
  }
}

function getAuthToken(): string | null {
  if (typeof window === "undefined") return null
  return sessionStorage.getItem("auth_token") || localStorage.getItem("auth_token")
}

export interface ApiFetchOptions extends RequestInit {
  /** Attach the Authorization header from stored auth_token. Default: true. */
  auth?: boolean
  /** Cache TTL in seconds for GET requests via cachedFetch. Default: 0 (no cache). */
  ttl?: number
}

/**
 * Single entry point for every backend call: resolves the API base URL once,
 * attaches the auth header, and normalizes errors into ApiError so callers
 * never need to know the backend's per-endpoint response envelope quirks.
 */
export async function apiFetch<T = unknown>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { auth = true, ttl = 0, headers, ...rest } = options
  const token = auth ? getAuthToken() : null

  const finalHeaders: HeadersInit = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...headers,
  }

  const url = `${BASE_URL}${path}`
  const method = (rest.method ?? "GET").toUpperCase()

  try {
    let data: any
    let status = 200

    if (method === "GET" && ttl > 0) {
      data = await cachedFetch<T>(url, { ...rest, headers: finalHeaders, ttl })
    } else {
      const res = await fetch(url, { ...rest, method, headers: finalHeaders })
      status = res.status
      data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new ApiError(status, data?.error || data?.message || res.statusText, data)
      }
    }

    return data as T
  } catch (err) {
    if (err instanceof ApiError) throw err
    throw new ApiError(0, "Lỗi kết nối. Vui lòng thử lại.", err)
  }
}

/** Fetch a binary/CSV response (e.g. admin report exports) — bypasses the JSON happy path. */
export async function apiFetchBlob(path: string, options: ApiFetchOptions = {}): Promise<Blob> {
  const { auth = true, headers, ...rest } = options
  const token = auth ? getAuthToken() : null

  const res = await fetch(`${BASE_URL}${path}`, {
    ...rest,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  })

  if (!res.ok) {
    throw new ApiError(res.status, res.statusText)
  }

  return res.blob()
}
