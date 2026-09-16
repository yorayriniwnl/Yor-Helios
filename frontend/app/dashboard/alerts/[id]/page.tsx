'use client'

import React from 'react'
import { useParams } from 'next/navigation'
import IncidentWorkspace from '../../../../components/alerts/IncidentWorkspace'
import ErrorMessage from '../../../../components/ui/ErrorMessage'

export default function AlertInvestigationPage() {
  const params = useParams<{ id?: string | string[] }>()
  const rawId = params?.id
  const alertId = Number(Array.isArray(rawId) ? rawId[0] : rawId)

  if (!Number.isInteger(alertId) || alertId <= 0) {
    return <ErrorMessage message="Invalid incident id." />
  }

  return <IncidentWorkspace alertId={alertId} />
}
