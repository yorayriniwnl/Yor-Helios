"use client"

import React, { useState } from 'react'
import { buildApiUrl, getAuthToken } from '../../lib/api'

type EvidenceItem = {
  id?: number
  alert_id?: number
  file_url?: string
  original_filename?: string
  gps_lat?: number | null
  gps_lon?: number | null
  evidence_ts?: string | null
  notes?: string | null
  before_after?: string | null
  created_at?: string | null
}

type Props = {
  alertId: number
  onUploaded?: (item: EvidenceItem) => void
}

const MAX_FILE_BYTES = 10 * 1024 * 1024
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])

export default function EvidenceUploader({ alertId, onUploaded }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [notes, setNotes] = useState('')
  const [beforeAfter, setBeforeAfter] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!file) {
      setError('Choose a file to upload.')
      return
    }
    if (!ALLOWED_TYPES.has(file.type) || file.size > MAX_FILE_BYTES) {
      setError('Use a JPEG, PNG, WebP, or PDF file up to 10 MB.')
      return
    }

    setUploading(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      if (notes.trim()) formData.append('notes', notes.trim())
      if (beforeAfter) formData.append('before_after', beforeAfter)

      const headers: HeadersInit = {}
      const token = getAuthToken()
      if (token) headers.Authorization = `Bearer ${token}`
      const controller = new AbortController()
      const timeout = window.setTimeout(() => controller.abort(), 30_000)
      let response: Response
      try {
        response = await fetch(buildApiUrl(`/alerts/${alertId}/evidence`), {
          method: 'POST',
          body: formData,
          headers,
          signal: controller.signal,
        })
      } finally {
        window.clearTimeout(timeout)
      }

      if (!response.ok) {
        let detail = 'Upload failed.'
        try {
          const body = await response.json()
          detail = body?.detail || detail
        } catch {
          // Ignore JSON parsing errors.
        }
        throw new Error(detail)
      }

      const item = (await response.json()) as EvidenceItem
      setFile(null)
      setNotes('')
      setBeforeAfter('')
      onUploaded?.(item)
    } catch (err: any) {
      setError(err?.message || 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1">
        <label htmlFor={`evidence-file-${alertId}`} className="text-xs font-medium text-[var(--muted)]">Evidence file</label>
        <input
          id={`evidence-file-${alertId}`}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          className="block w-full text-xs"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-[var(--muted)]">Stage</label>
        <select
          value={beforeAfter}
          onChange={(event) => setBeforeAfter(event.target.value)}
          className="w-full rounded border bg-transparent px-2 py-1 text-xs"
        >
          <option value="">Unspecified</option>
          <option value="before">Before</option>
          <option value="after">After</option>
        </select>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-[var(--muted)]">Notes</label>
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={3}
          className="w-full rounded border bg-transparent px-2 py-1 text-xs"
          placeholder="Optional inspection notes"
        />
      </div>

      {error && <div className="text-xs text-red-300">{error}</div>}

      <button
        type="submit"
        disabled={uploading}
        className="rounded border px-3 py-1 text-xs disabled:opacity-50"
      >
        {uploading ? 'Uploading...' : 'Upload evidence'}
      </button>
    </form>
  )
}
