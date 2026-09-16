import { emitLocalMessage } from './websocket'
import type { ApiAlert, ApiAlertInvestigation, ApiMeter, DashboardSummary, RecoveryMetrics, ZoneOverview } from '../types/api'

let running = false
let interval: ReturnType<typeof setInterval> | null = null
let sequence = 0

const DEMO_METERS = [101, 204, 305, 412]

function demoTimestamp(minutesAgo: number): string {
  return new Date(Date.now() - minutesAgo * 60_000).toISOString()
}

export function getDemoAlerts(): ApiAlert[] {
  return [
    {
      id: 9101,
      meter_id: 101,
      type: 'voltage_spike',
      severity: 'critical',
      status: 'open',
      score: 0.96,
      explanation: 'Sustained voltage spike suggests transformer stress on the north feeder.',
      created_at: demoTimestamp(8),
    },
    {
      id: 9102,
      meter_id: 204,
      type: 'tamper_suspicion',
      severity: 'high',
      status: 'assigned',
      score: 0.82,
      explanation: 'Under-reporting pattern may indicate meter interference; field inspection recommended.',
      created_at: demoTimestamp(42),
      assigned_to: 7,
      responded_at: demoTimestamp(31),
    },
    {
      id: 9103,
      meter_id: 305,
      type: 'frequent_disconnects',
      severity: 'medium',
      status: 'open',
      score: 0.58,
      explanation: 'Frequent disconnects are reducing telemetry confidence for this meter.',
      created_at: demoTimestamp(95),
    },
    {
      id: 9104,
      meter_id: 412,
      type: 'loss_recovery',
      severity: 'low',
      status: 'resolved',
      score: 0.28,
      explanation: 'Consumption returned to baseline after a verified field repair.',
      created_at: demoTimestamp(220),
      resolved_at: demoTimestamp(160),
      resolution_notes: 'Demo recovery case closed after inspection.',
    },
  ]
}

export function getDemoAlertInvestigation(alertId: number): ApiAlertInvestigation | null {
  const alert = getDemoAlerts().find((item) => item.id === alertId)
  if (!alert) return null

  const meter = getDemoMeters().find((item) => item.id === alert.meter_id) ?? null
  const zone = meter ? getDemoZones().find((item) => item.id === meter.zone_id) ?? null : null
  const hasReading = alert.id !== 9103
  const reading = hasReading && meter
    ? {
        id: 980_000 + alert.id,
        meter_id: meter.id,
        timestamp: alert.created_at ?? new Date().toISOString(),
        voltage: alert.id === 9101 ? 248 : alert.id === 9102 ? 229 : 231,
        current: alert.id === 9102 ? 0.42 : 8.6,
        power_consumption: alert.id === 9102 ? 96 : alert.id === 9101 ? 2_480 : 1_920,
      }
    : null
  const anomalies = hasReading
    ? [{
        id: 990_000 + alert.id,
        meter_id: alert.meter_id,
        reading_id: reading?.id,
        type: alert.type,
        score: alert.score,
        explanation: alert.explanation,
        created_at: alert.created_at,
      }]
    : []
  const timeline = [
    {
      event: 'detected',
      at: alert.created_at ?? new Date().toISOString(),
      actor_id: null,
      detail: 'Alert created by the demo detection pipeline',
      source: 'demo_scenario',
    },
    ...(alert.responded_at ? [{
      event: 'assigned',
      at: alert.responded_at,
      actor_id: alert.assigned_to ?? null,
      detail: 'Alert assigned for field investigation',
      source: 'demo_scenario',
    }] : []),
    ...(alert.resolved_at ? [{
      event: 'resolved',
      at: alert.resolved_at,
      actor_id: alert.assigned_to ?? null,
      detail: alert.resolution_notes ?? 'Alert marked resolved',
      source: 'demo_scenario',
    }] : []),
  ]

  const possibleCauses = alert.type.includes('tamper')
    ? ['Meter interference, bypass, or an installation fault', 'Telemetry/reporting fault causing under-reporting']
    : alert.type.includes('voltage')
      ? ['Upstream voltage instability or transformer stress', 'Local wiring, connection, or meter-sensor fault']
      : alert.type.includes('disconnect')
        ? ['Intermittent connectivity or power quality interruption', 'Meter hardware, antenna, or installation fault']
        : ['The stored alert type requires field verification', 'No single cause is established by this signal alone']

  return {
    alert,
    meter,
    zone,
    reading,
    anomalies,
    evidence: [],
    timeline,
    investigation: {
      detector: 'rule_baseline_with_optional_ml',
      score_band: alert.severity === 'critical' || alert.severity === 'high' ? 'HIGH' : alert.severity.toUpperCase(),
      score_is_probability: false,
      evidence_state: reading ? 'MEASURED_READING' : 'NO_LINKED_READING',
      observed_signals: reading
        ? [
            `Power ${reading.power_consumption?.toFixed(2)} W`,
            `Voltage ${reading.voltage?.toFixed(2)} V`,
            `Current ${reading.current?.toFixed(2)} A`,
            `Observed at ${reading.timestamp}`,
          ]
        : [],
      possible_causes: possibleCauses,
      uncertainty: [
        'The detector score is an anomaly score, not a calibrated probability.',
        ...(reading ? [] : ['No telemetry reading is linked to this alert.']),
        ...(anomalies.length ? [] : ['No related anomaly event is stored for this alert.']),
      ],
      recommended_response: alert.status === 'resolved'
        ? 'Review the resolution note and retain the evidence chain for audit.'
        : 'Inspect the linked reading and meter context, then record the field outcome before resolving.',
    },
  }
}

export function getDemoSummary(): DashboardSummary {
  return {
    total_meters: 48,
    total_readings: 18_640,
    total_alerts: 12,
    open_alerts: 3,
    critical_alerts: 1,
    zone_loss_percentage: 0.074,
    transformer_health: {
      average_health_score: 0.86,
      counts: { good: 7, warning: 2, critical: 1 },
      total_transformers: 10,
    },
  }
}

export function getDemoRecovery(): RecoveryMetrics {
  return {
    total_recovered_value: 184_500,
    zone_recovery: [
      { zone_id: 1, zone_name: 'North Feeder', recovered_value: 92_000 },
      { zone_id: 2, zone_name: 'Market Loop', recovered_value: 58_500 },
      { zone_id: 3, zone_name: 'East Ridge', recovered_value: 34_000 },
    ],
    inspector_stats: [
      { user_id: 7, name: 'Inspector Raj', assigned: 8, resolved: 6, success_rate: 0.75, avg_time_to_close_minutes: 48 },
      { user_id: 12, name: 'Inspector Meera', assigned: 5, resolved: 4, success_rate: 0.8, avg_time_to_close_minutes: 39 },
    ],
    success_rate: 0.78,
    avg_time_to_close_minutes: 44,
    window_days: 30,
  }
}

export function getDemoZones(): ZoneOverview[] {
  return [
    { id: 1, name: 'North Feeder', city: 'Bengaluru', state: 'KA', risk: 'critical', zone_loss_percentage: 0.092, meter_count: 18, alert_count: 6, anomaly_count: 9, anomaly_density: 0.5, critical_count: 2, total_consumption: 12800 },
    { id: 2, name: 'Market Loop', city: 'Bengaluru', state: 'KA', risk: 'high', zone_loss_percentage: 0.071, meter_count: 16, alert_count: 4, anomaly_count: 6, anomaly_density: 0.375, critical_count: 1, total_consumption: 11100 },
    { id: 3, name: 'East Ridge', city: 'Bengaluru', state: 'KA', risk: 'medium', zone_loss_percentage: 0.041, meter_count: 14, alert_count: 2, anomaly_count: 3, anomaly_density: 0.214, critical_count: 0, total_consumption: 9700 },
  ]
}

export function getDemoMeters(): ApiMeter[] {
  return [
    { id: 101, meter_number: 'MTR-0101', household_name: 'North feeder kiosk', zone_id: 1, latitude: 12.982, longitude: 77.595, status: 'active' },
    { id: 204, meter_number: 'MTR-0204', household_name: 'Market street cluster', zone_id: 2, latitude: 12.968, longitude: 77.602, status: 'active' },
    { id: 305, meter_number: 'MTR-0305', household_name: 'East ridge substation', zone_id: 3, latitude: 12.957, longitude: 77.618, status: 'active' },
    { id: 412, meter_number: 'MTR-0412', household_name: 'Community transformer', zone_id: 1, latitude: 12.991, longitude: 77.581, status: 'maintenance' },
  ]
}

function demoReading() {
  const meterId = DEMO_METERS[sequence % DEMO_METERS.length]
  const reading = {
    id: 900_000 + sequence,
    meter_id: meterId,
    timestamp: new Date().toISOString(),
    voltage: 228 + (sequence % 5),
    current: 8 + (sequence % 4),
    power_consumption: 1800 + ((sequence * 137) % 900),
  }
  sequence += 1
  return reading
}

export function isDemoModeEnabled(): boolean {
  if (running) return true
  try {
    return window.localStorage.getItem('helios.demo') === '1'
      || new URLSearchParams(window.location.search).get('demo') === 'silent'
  } catch {
    return false
  }
}

export function isDemoRunning(): boolean {
  return isDemoModeEnabled()
}

export function startDemo(): void {
  if (running) return
  running = true
  sequence = 0
  emitLocalMessage({ type: 'reading', data: demoReading() })
  interval = setInterval(() => {
    if (!running) return
    emitLocalMessage({ type: 'reading', data: demoReading() })
  }, 2_500)
}

export function stopDemo(): void {
  running = false
  if (interval) clearInterval(interval)
  interval = null
}

export function triggerShockAlert() {
  const meterId = DEMO_METERS[sequence % DEMO_METERS.length]
  sequence += 1
  const alert = {
    id: 910_000 + sequence,
    meter_id: meterId,
    type: 'tamper_suspicion',
    severity: 'critical' as const,
    status: 'open' as const,
    score: 0.97,
    explanation: `Sustained under-reporting detected at M-${meterId}; inspect the meter and transformer path.`,
    created_at: new Date().toISOString(),
  }
  emitLocalMessage({ type: 'alert', data: alert })
  return alert
}
