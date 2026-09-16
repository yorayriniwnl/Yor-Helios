/**
 * Shared TypeScript types for Helios API responses.
 * Keep these aligned with the backend Pydantic schemas.
 */

// ─── Auth ────────────────────────────────────────────────────────────────────

export interface LoginResponse {
  access_token: string
  token_type?: string
}

// ─── Users ───────────────────────────────────────────────────────────────────

export interface ApiUser {
  id: number
  email: string
  name?: string
  role?: string
  created_at?: string
}

// ─── Zones ───────────────────────────────────────────────────────────────────

export interface ApiZone {
  id: number
  name: string
  city?: string
  state?: string
  risk?: 'low' | 'medium' | 'high' | string
  zone_loss_percentage?: number
}

export interface ZoneOverview extends ApiZone {
  meter_count?: number
  alert_count?: number
  anomaly_count?: number
  anomaly_density?: number
  critical_count?: number
  total_consumption?: number
}

// ─── Meters ──────────────────────────────────────────────────────────────────

export interface ApiMeter {
  id: number
  meter_number: string
  household_name?: string
  zone_id?: number
  latitude?: number
  longitude?: number
  status?: string
  install_date?: string
}

// ─── Readings ────────────────────────────────────────────────────────────────

export interface ApiReading {
  id: number
  meter_id: number
  timestamp: string
  voltage?: number
  current?: number
  power_consumption?: number
}

// ─── Alerts ──────────────────────────────────────────────────────────────────

export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical'
export type AlertStatus = 'open' | 'assigned' | 'investigating' | 'resolved'

export interface ApiAlert {
  id: number
  meter_id?: number
  reading_id?: number
  type: string
  severity: AlertSeverity
  status: AlertStatus
  score?: number
  explanation?: string
  created_at?: string
  updated_at?: string
  responded_at?: string | null
  resolved_at?: string | null
  assigned_to?: number | null
  resolution_notes?: string | null
  sla_breached?: boolean
}

// ─── Anomalies ───────────────────────────────────────────────────────────────

export interface ApiAnomaly {
  id: number
  meter_id?: number
  reading_id?: number
  type: string
  score?: number
  explanation?: string
  created_at?: string
}

export interface InvestigationEvidence {
  id: number
  alert_id: number
  original_filename?: string | null
  file_url: string
  gps_lat?: number | null
  gps_lon?: number | null
  evidence_ts?: string | null
  notes?: string | null
  before_after?: 'before' | 'after' | string | null
  created_at: string
}

export interface InvestigationTimelineEvent {
  event: string
  at: string
  actor_id?: number | null
  detail?: string | null
  source?: string
}

export interface AlertInvestigationContext {
  detector: string
  score_band: 'HIGH' | 'MEDIUM' | 'LOW' | string
  score_is_probability: false
  evidence_state: 'MEASURED_READING' | 'NO_LINKED_READING' | string
  observed_signals: string[]
  possible_causes: string[]
  uncertainty: string[]
  recommended_response: string
}

export interface ApiAlertInvestigation {
  alert: ApiAlert
  meter?: ApiMeter | null
  zone?: ApiZone | null
  reading?: ApiReading | null
  anomalies: ApiAnomaly[]
  evidence: InvestigationEvidence[]
  timeline: InvestigationTimelineEvent[]
  investigation: AlertInvestigationContext
}

// ─── Dashboard / Summary ─────────────────────────────────────────────────────

export interface DashboardSummary {
  total_meters: number
  total_readings: number
  total_alerts: number
  open_alerts?: number
  critical_alerts?: number
  zone_loss_percentage?: number
  transformer_health?: {
    average_health_score: number
    counts: { good: number; warning: number; critical: number }
    total_transformers: number
  }
}

export interface RecoveryMetrics {
  total_recovered_value: number
  zone_recovery: Array<{
    zone_id: number
    zone_name: string
    recovered_value: number
  }>
  inspector_stats: Array<{
    user_id: number
    name: string
    assigned: number
    resolved: number
    success_rate: number
    avg_time_to_close_minutes: number
  }>
  success_rate: number
  avg_time_to_close_minutes: number
  window_days: number
}

// ─── Recommendations ─────────────────────────────────────────────────────────

export interface ApiRecommendation {
  id?: number
  alert_id?: number
  title: string
  description: string
  priority?: string
  estimated_savings?: number
  created_at?: string
}

// ─── WebSocket Messages ──────────────────────────────────────────────────────

export type WsMessageType = 'reading' | 'alert' | 'anomaly' | 'ping'

export interface WsMessage<T = unknown> {
  type: WsMessageType
  data: T
  sequence?: number
  event_id?: string
}

export type WsReadingMessage = WsMessage<ApiReading>
export type WsAlertMessage = WsMessage<ApiAlert>
export type WsAnomalyMessage = WsMessage<ApiAnomaly>
