import type { components } from '~/types/generated'
export type Metric = components['schemas']['MetricValue']
export type Metrics = components['schemas']['Metrics']
export const metricLabels: Record<keyof Metrics, string> = {
  cpu_percent: 'Utilisation CPU', cpu_temperature: 'Température CPU', load_1m: 'Charge sur 1 minute',
  memory_used_bytes: 'Mémoire utilisée', memory_total_bytes: 'Mémoire totale',
  gpu_video_percent: 'GPU vidéo · moteur le plus occupé', gpu_render_percent: 'GPU rendu · moteur le plus occupé',
  gpu_temperature: 'Température GPU', gpu_power_watts: 'Puissance GPU', gpu_frequency_mhz: 'Fréquence GPU',
  disk_read_bytes_per_second: 'Disques · lecture', disk_write_bytes_per_second: 'Disques · écriture',
  network_receive_bytes_per_second: 'Réseau · réception', network_send_bytes_per_second: 'Réseau · émission',
  storage_used_bytes: 'Stockage utilisé', storage_total_bytes: 'Stockage total',
  plex_sessions: 'Sessions Plex', plex_transcodes: 'Transcodages Plex', plex_hardware_transcodes: 'Transcodages avec matériel',
}
const number = (n: number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(n)
export function metricText(m?: Metric, stale = false): string {
  if (stale || m?.status === 'stale') return 'Donnée périmée'
  if (m?.status === 'error') return 'Mesure en erreur'
  if (!m || m.status !== 'available' || m.value === null) return 'Non disponible'
  if (m.unit === 'bytes' || m.unit === 'bytes_per_second') {
    const units = ['o', 'Kio', 'Mio', 'Gio', 'Tio']; let value = m.value; let i = 0
    while (value >= 1024 && i < units.length - 1) { value /= 1024; i++ }
    return `${number(value)} ${units[i]}${m.unit === 'bytes_per_second' ? '/s' : ''}`
  }
  const units = { percent: ' %', celsius: ' °C', watts: ' W', mhz: ' MHz', load: '', count: '' }
  return number(m.value) + units[m.unit]
}
export function metricDate(value: string): string {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'Europe/Paris' }).format(new Date(value))
}
