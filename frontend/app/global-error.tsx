"use client"

import { useEffect } from "react"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log error to error reporting service
    console.error("Global error:", error)
  }, [error])

  return (
    <html lang="vi">
      <body>
        <div style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1rem",
          backgroundColor: "#0a0a0a",
          color: "#fafafa",
          fontFamily: "system-ui, sans-serif"
        }}>
          <div style={{
            maxWidth: "28rem",
            width: "100%",
            textAlign: "center"
          }}>
            <div style={{
              width: "3rem",
              height: "3rem",
              borderRadius: "50%",
              backgroundColor: "rgba(239, 68, 68, 0.1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 1.5rem"
            }}>
              <span style={{ fontSize: "1.5rem" }}>⚠️</span>
            </div>
            
            <h1 style={{
              fontSize: "1.5rem",
              fontWeight: "bold",
              marginBottom: "0.5rem"
            }}>
              Lỗi hệ thống nghiêm trọng
            </h1>
            
            <p style={{
              color: "#a1a1aa",
              marginBottom: "1.5rem"
            }}>
              Ứng dụng gặp sự cố nghiêm trọng. Vui lòng tải lại trang.
            </p>

            {process.env.NODE_ENV === "development" && (
              <div style={{
                padding: "1rem",
                backgroundColor: "#27272a",
                borderRadius: "0.5rem",
                marginBottom: "1.5rem",
                textAlign: "left"
              }}>
                <code style={{
                  fontSize: "0.875rem",
                  wordBreak: "break-all"
                }}>
                  {error.message}
                </code>
              </div>
            )}

            <div style={{
              display: "flex",
              gap: "0.75rem",
              justifyContent: "center"
            }}>
              <button
                onClick={reset}
                style={{
                  padding: "0.5rem 1.5rem",
                  backgroundColor: "#3b82f6",
                  color: "white",
                  border: "none",
                  borderRadius: "0.375rem",
                  cursor: "pointer",
                  fontSize: "0.875rem",
                  fontWeight: "500"
                }}
              >
                Thử lại
              </button>
              <button
                onClick={() => window.location.href = "/"}
                style={{
                  padding: "0.5rem 1.5rem",
                  backgroundColor: "transparent",
                  color: "#fafafa",
                  border: "1px solid #27272a",
                  borderRadius: "0.375rem",
                  cursor: "pointer",
                  fontSize: "0.875rem",
                  fontWeight: "500"
                }}
              >
                Về trang chủ
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  )
}
