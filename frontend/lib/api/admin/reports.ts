import { apiFetch, apiFetchBlob } from "../client"

function cinemaQS(cinemaId?: string | null, prefix: "?" | "&" = "&") {
  return cinemaId && cinemaId !== "all" ? `${prefix}cinemaId=${cinemaId}` : ""
}

export async function getReportsSummary(from: string, to: string, cinemaId?: string | null): Promise<{
  revenue: number
  tickets: number
  new_users: number
  showtimes: number
}> {
  return apiFetch(`/api/admin/reports/summary?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${cinemaQS(cinemaId)}`)
}

export interface DailyRevenueRow {
  day: string
  revenue: number
  tickets: number
}

export interface TopMovieRow {
  id: number
  title: string
  revenue: number
  tickets: number
}

export async function getReportsDaily(from: string, to: string, cinemaId?: string | null): Promise<DailyRevenueRow[]> {
  const data = await apiFetch<{ data: DailyRevenueRow[] }>(
    `/api/admin/reports/daily?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${cinemaQS(cinemaId)}`,
  )
  return Array.isArray(data.data) ? data.data : []
}

export async function getReportsTopMovies(
  from: string,
  to: string,
  limit = 10,
  cinemaId?: string | null,
): Promise<TopMovieRow[]> {
  const data = await apiFetch<{ data: TopMovieRow[] }>(
    `/api/admin/reports/top-movies?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&limit=${limit}${cinemaQS(cinemaId)}`,
  )
  return Array.isArray(data.data) ? data.data : []
}

export type ReportCsvType = "tickets" | "revenue-daily" | "top-movies" | "showtime-performance"

export async function exportReportCsv(
  type: ReportCsvType,
  from: string,
  to: string,
  cinemaId?: string | null,
): Promise<Blob> {
  return apiFetchBlob(
    `/api/admin/reports/exports/${type}.csv?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${cinemaQS(cinemaId)}`,
  )
}

export interface ReportDetailTable {
  label: string
  headers: string[]
  rows: (string | number)[][]
}

export interface DailyMovieBreakdownRow {
  day: string
  title: string
  revenue: number
  tickets: number
}

/** Doanh thu/vé theo từng (ngày, phim) — dùng để drill-down trong dialog "Doanh thu theo ngày". */
export async function getDailyMovieBreakdown(
  from: string,
  to: string,
  cinemaId?: string | null,
): Promise<DailyMovieBreakdownRow[]> {
  const data = await apiFetch<{ data: DailyMovieBreakdownRow[] }>(
    `/api/admin/reports/daily/movie-breakdown?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${cinemaQS(cinemaId)}`,
  )
  return Array.isArray(data.data) ? data.data : []
}

/** Same underlying data as exportReportCsv, returned as JSON for in-app display instead of a file download. */
export async function getReportDetail(
  type: ReportCsvType,
  from: string,
  to: string,
  cinemaId?: string | null,
): Promise<ReportDetailTable> {
  return apiFetch(
    `/api/admin/reports/detail/${type}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${cinemaQS(cinemaId)}`,
  )
}
