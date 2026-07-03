import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Combina clases tailwind resolviendo conflictos. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(n: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(n || 0)
}

export function formatNumber(n: number) {
  return new Intl.NumberFormat('en-US').format(n || 0)
}

export function formatPercent(n: number) {
  return `${(n || 0).toFixed(1)}%`
}

/** Color de badge según score 0-100. */
export function scoreColor(score: number): { bg: string; text: string; label: string } {
  if (score <= 40) return { bg: 'bg-red-100 dark:bg-red-500/15', text: 'text-red-600 dark:text-red-400', label: 'Bajo' }
  if (score <= 70) return { bg: 'bg-amber-100 dark:bg-amber-500/15', text: 'text-amber-600 dark:text-amber-400', label: 'Medio' }
  return { bg: 'bg-green-100 dark:bg-green-500/15', text: 'text-green-600 dark:text-green-400', label: 'Alto' }
}

/** Fuzzy search simple para filtros de tabla/búsqueda global. */
export function fuzzyMatch(text: string, query: string): boolean {
  if (!query) return true
  const t = (text || '').toLowerCase()
  const q = query.toLowerCase().trim()
  if (t.includes(q)) return true
  let i = 0
  for (const ch of t) {
    if (ch === q[i]) i++
    if (i === q.length) return true
  }
  return false
}

export function initials(name: string) {
  return (name || '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('')
}

/** Genera un color determinista a partir de un string (avatars). */
export function stringToColor(str: string) {
  let hash = 0
  for (let i = 0; i < (str || '').length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash)
  const palette = ['#ff7448', '#6248ff', '#f38744', '#0082f3', '#16a34a', '#ef6820']
  return palette[Math.abs(hash) % palette.length]
}

export const MAX_ATTACHMENT_MB = 12

/** Convierte un File a base64 (sin el prefijo data:...;base64,) para adjuntarlo por SMTP vía n8n. */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.split(',')[1] || '')
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export function downloadCSV(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return
  const headers = Object.keys(rows[0])
  const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const csv = [
    headers.join(','),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(',')),
  ].join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
