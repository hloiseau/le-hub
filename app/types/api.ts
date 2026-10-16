import type { components } from './generated'
export type Service = components['schemas']['Service']
export type User = components['schemas']['User']
export type Session = components['schemas']['Session']
export type Capabilities = components['schemas']['Capabilities']
export type Media = components['schemas']['Media']
export type MediaRequest = components['schemas']['MediaRequest']
export type RequestStatus = MediaRequest['status']
export type RequestPage = components['schemas']['RequestPage']
export type Departures = components['schemas']['Departures']
export type RecentPage = components['schemas']['Recent']
export type ReminderInbox = components['schemas']['ReminderInbox']
export type ReminderPreferences = components['schemas']['ReminderPreferences']
export const statusLabels: Record<RequestStatus, string> = { pending: 'En attente', approved: 'Approuvée', declined: 'Refusée', processing: 'En cours', partial: 'Disponibilité partielle', available: 'Disponible', unknown: 'État inconnu' }
