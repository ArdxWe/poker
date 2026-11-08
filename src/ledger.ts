export type Player = {
  id: string
  name: string
  buyIns: number
  /** Chips left; `null` while the field is cleared for retyping. */
  left: number | null
}

export type Session = {
  oneBuyIn: number
  players: Player[]
}

export type Summary = {
  totalBuyIns: number
  totalIn: number
  totalLeft: number
  offBy: number
}

export function playerNet(player: Player, oneBuyIn: number): number {
  return (player.left ?? 0) - player.buyIns * oneBuyIn
}

export function summarize(session: Session): Summary {
  const totalBuyIns = session.players.reduce((sum, player) => sum + player.buyIns, 0)
  const totalLeft = session.players.reduce((sum, player) => sum + (player.left ?? 0), 0)
  const totalIn = totalBuyIns * session.oneBuyIn
  return {
    totalBuyIns,
    totalIn,
    totalLeft,
    offBy: totalLeft - totalIn,
  }
}

export function formatAmount(value: number): string {
  return value.toLocaleString('en-US')
}

export function formatSigned(value: number): string {
  const amount = formatAmount(Math.abs(value))
  if (value > 0) return `+${amount}`
  if (value < 0) return `−${amount}`
  return '0'
}

export function wholeNumber(value: number): number | null {
  if (!Number.isSafeInteger(value) || value < 0) return null
  return value
}

export function chipsLeft(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null
  return wholeNumber(Number(raw))
}

export type GamePlayer = {
  name: string
  buyIns: number
  left: number
  net: number
}

export type Game = {
  id: string
  title: string
  playedAt: string
  oneBuyIn: number
  players: GamePlayer[]
}

export type Standing = {
  name: string
  net: number
}

function nameKey(name: string): string {
  return name.trim().toLocaleLowerCase()
}

export function recordGame(session: Session, playedAt: string, id: string, title = ''): Game | null {
  const grouped = new Map<string, GamePlayer>()
  for (const player of session.players) {
    const name = player.name.trim()
    if (!name) continue
    const key = nameKey(name)
    const left = player.left ?? 0
    const net = playerNet(player, session.oneBuyIn)
    const existing = grouped.get(key)
    if (existing) {
      existing.buyIns += player.buyIns
      existing.left += left
      existing.net += net
    } else {
      grouped.set(key, { name, buyIns: player.buyIns, left, net })
    }
  }
  if (grouped.size === 0) return null
  return { id, title: title.trim(), playedAt, oneBuyIn: session.oneBuyIn, players: [...grouped.values()] }
}

export function standings(games: Game[]): Standing[] {
  const totals = new Map<string, Standing>()
  for (const game of games) {
    for (const player of game.players) {
      const name = player.name.trim()
      if (!name) continue
      const key = nameKey(name)
      const existing = totals.get(key)
      if (existing) existing.net += player.net
      else totals.set(key, { name, net: player.net })
    }
  }
  return [...totals.values()].sort((a, b) => b.net - a.net || a.name.localeCompare(b.name))
}

export function newId(): string {
  const source = globalThis.crypto
  if (source && typeof source.randomUUID === 'function') return source.randomUUID()
  const bytes = new Uint8Array(16)
  if (source && typeof source.getRandomValues === 'function') source.getRandomValues(bytes)
  else {
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256)
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
