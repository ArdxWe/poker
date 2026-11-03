import { wholeNumber, type Player, type Session } from './ledger'

export const STORAGE_KEY = 'felt.session.v1'

export function emptySession(): Session {
  return { oneBuyIn: 200, players: [] }
}

export function loadSession(): Session {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptySession()
    return normalizeSession(JSON.parse(raw))
  } catch {
    return emptySession()
  }
}

export function saveSession(session: Session): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
}

function normalizeSession(value: unknown): Session {
  if (!value || typeof value !== 'object') return emptySession()
  const record = value as { oneBuyIn?: unknown; players?: unknown }
  const oneBuyIn = positive(record.oneBuyIn) ?? 200
  const players = Array.isArray(record.players)
    ? record.players.flatMap((player) => {
        const normalized = normalizePlayer(player)
        return normalized ? [normalized] : []
      })
    : []
  return { oneBuyIn, players }
}

function normalizePlayer(value: unknown): Player | null {
  if (!value || typeof value !== 'object') return null
  const record = value as { id?: unknown; name?: unknown; buyIns?: unknown; left?: unknown }
  const buyIns = wholeNumber(typeof record.buyIns === 'number' ? record.buyIns : -1)
  const left = wholeNumber(typeof record.left === 'number' ? record.left : -1)
  if (typeof record.id !== 'string' || buyIns === null || left === null) return null
  const name = typeof record.name === 'string' ? record.name : ''
  return { id: record.id, name, buyIns, left }
}

function positive(value: unknown): number | null {
  if (typeof value !== 'number') return null
  const whole = wholeNumber(value)
  if (whole === null || whole < 1) return null
  return whole
}
