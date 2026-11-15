import { wholeNumber, type Game, type GamePlayer, type Player, type Session } from './ledger.ts'

export const STORAGE_KEY = 'felt.session.v1'
export const CLUB_KEY = 'felt.club.v1'
export const CLOUD_CACHE_KEY = 'felt.cloud.v1'

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

export function loadClub(): Game[] {
  try {
    const raw = localStorage.getItem(CLUB_KEY)
    if (!raw) return []
    return normalizeClub(JSON.parse(raw))
  } catch {
    return []
  }
}

export function saveClub(games: Game[]): void {
  localStorage.setItem(CLUB_KEY, JSON.stringify(games))
}

export type CachedClub = {
  id: string
  name: string
  readHash: string
  writeHash: string
  readerId: string
  writerId: string
  games: Game[]
}

export function loadCloudCache(): CachedClub | null {
  try {
    const raw = localStorage.getItem(CLOUD_CACHE_KEY)
    if (!raw) return null
    return normalizeCachedClub(JSON.parse(raw))
  } catch {
    return null
  }
}

export function saveCloudCache(club: CachedClub | null): void {
  if (!club) {
    localStorage.removeItem(CLOUD_CACHE_KEY)
    return
  }
  localStorage.setItem(CLOUD_CACHE_KEY, JSON.stringify(club))
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
  const left =
    record.left === null
      ? null
      : wholeNumber(typeof record.left === 'number' ? record.left : -1)
  if (typeof record.id !== 'string' || buyIns === null) return null
  if (record.left !== null && left === null) return null
  const name = typeof record.name === 'string' ? record.name : ''
  return { id: record.id, name, buyIns, left }
}

function normalizeCachedClub(value: unknown): CachedClub | null {
  if (!value || typeof value !== 'object') return null
  const record = value as {
    id?: unknown
    name?: unknown
    readHash?: unknown
    writeHash?: unknown
    readerId?: unknown
    writerId?: unknown
    games?: unknown
  }
  const name = typeof record.name === 'string' ? record.name.trim() : ''
  if (!name || typeof record.id !== 'string' || !record.id) return null
  if (typeof record.readHash !== 'string' || typeof record.writeHash !== 'string') return null
  if (typeof record.readerId !== 'string' || typeof record.writerId !== 'string') return null
  if (!Array.isArray(record.games)) return null
  return {
    id: record.id,
    name,
    readHash: record.readHash,
    writeHash: record.writeHash,
    readerId: record.readerId,
    writerId: record.writerId,
    games: normalizeClub(record.games),
  }
}

function normalizeClub(value: unknown): Game[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((game) => {
    const normalized = normalizeGame(game)
    return normalized ? [normalized] : []
  })
}

function normalizeGame(value: unknown): Game | null {
  if (!value || typeof value !== 'object') return null
  const record = value as { id?: unknown; title?: unknown; playedAt?: unknown; oneBuyIn?: unknown; players?: unknown }
  if (typeof record.id !== 'string' || typeof record.playedAt !== 'string') return null
  if (Number.isNaN(Date.parse(record.playedAt))) return null
  const oneBuyIn = positive(record.oneBuyIn)
  if (oneBuyIn === null || !Array.isArray(record.players)) return null
  const players = record.players.flatMap((player) => {
    const normalized = normalizeGamePlayer(player)
    return normalized ? [normalized] : []
  })
  if (players.length === 0) return null
  const title = typeof record.title === 'string' ? record.title.trim() : ''
  return { id: record.id, title, playedAt: record.playedAt, oneBuyIn, players }
}

function normalizeGamePlayer(value: unknown): GamePlayer | null {
  if (!value || typeof value !== 'object') return null
  const record = value as { name?: unknown; buyIns?: unknown; left?: unknown; net?: unknown }
  const name = typeof record.name === 'string' ? record.name.trim() : ''
  const buyIns = wholeNumber(typeof record.buyIns === 'number' ? record.buyIns : -1)
  const left = wholeNumber(typeof record.left === 'number' ? record.left : -1)
  const net = signed(record.net)
  if (!name || buyIns === null || left === null || net === null) return null
  return { name, buyIns, left, net }
}

function signed(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) return null
  return value
}

function positive(value: unknown): number | null {
  if (typeof value !== 'number') return null
  const whole = wholeNumber(value)
  if (whole === null || whole < 1) return null
  return whole
}

export function readStoredGame(value: unknown): Game | null {
  return normalizeGame(value)
}
