import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Format chuẩn duy nhất cho tiền VNĐ trên toàn site — luôn dùng hàm này, không tự ghép chuỗi. */
export function formatVND(amount: number | string | null | undefined): string {
  const n = Number(amount) || 0
  return n.toLocaleString('vi-VN', { style: 'currency', currency: 'VND' })
}
