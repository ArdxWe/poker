import { wholeNumber, type Game, type GamePlayer } from './ledger.ts'

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlToBytes(token: string): Uint8Array {
  const padded = token.replace(/-/g, '+').replace(/_/g, '/')
  const base64 = padded + '='.repeat((4 - (padded.length % 4)) % 4)
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
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

function parseSharedPlayer(value: unknown): GamePlayer | null {
  if (!value || typeof value !== 'object') return null
  const record = value as { name?: unknown; buyIns?: unknown; left?: unknown; net?: unknown }
  const name = typeof record.name === 'string' ? record.name.trim() : ''
  const buyIns = wholeNumber(typeof record.buyIns === 'number' ? record.buyIns : -1)
  const left = wholeNumber(typeof record.left === 'number' ? record.left : -1)
  const net = signed(record.net)
  if (!name || buyIns === null || left === null || net === null) return null
  return { name, buyIns, left, net }
}

function parseSharedGame(value: unknown): Game | null {
  if (!value || typeof value !== 'object') return null
  const record = value as { id?: unknown; title?: unknown; playedAt?: unknown; oneBuyIn?: unknown; players?: unknown }
  if (typeof record.id !== 'string' || typeof record.playedAt !== 'string') return null
  if (Number.isNaN(Date.parse(record.playedAt))) return null
  const oneBuyIn = positive(record.oneBuyIn)
  if (oneBuyIn === null || !Array.isArray(record.players)) return null
  const players = record.players.flatMap((player) => {
    const normalized = parseSharedPlayer(player)
    return normalized ? [normalized] : []
  })
  if (players.length === 0) return null
  const title = typeof record.title === 'string' ? record.title.trim() : ''
  return { id: record.id, title, playedAt: record.playedAt, oneBuyIn, players }
}

export function encodeGameShare(game: Game): string {
  const json = JSON.stringify(game)
  return bytesToBase64Url(new TextEncoder().encode(json))
}

export function decodeGameShare(token: string): Game | null {
  try {
    if (!token || token.length > 12000) return null
    const json = new TextDecoder().decode(base64UrlToBytes(token))
    return parseSharedGame(JSON.parse(json))
  } catch {
    return null
  }
}

export function readShareTokenFromLocation(locationLike: Pick<Location, 'hash'> = window.location): string | null {
  const hash = locationLike.hash.startsWith('#') ? locationLike.hash.slice(1) : locationLike.hash
  if (!hash) return null
  const params = new URLSearchParams(hash.includes('=') ? hash : `g=${hash}`)
  const token = params.get('g')
  return token && token.length > 0 ? token : null
}

export function buildShareUrl(game: Game, origin = window.location.origin, pathname = window.location.pathname): string {
  return `${origin}${pathname}#g=${encodeGameShare(game)}`
}

export function clearShareHash(): void {
  const { pathname, search } = window.location
  window.history.replaceState(null, '', `${pathname}${search}`)
}
