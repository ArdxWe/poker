export type Player = {
  id: string
  name: string
  buyIns: number
  left: number
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
  return player.left - player.buyIns * oneBuyIn
}

export function summarize(session: Session): Summary {
  const totalBuyIns = session.players.reduce((sum, player) => sum + player.buyIns, 0)
  const totalLeft = session.players.reduce((sum, player) => sum + player.left, 0)
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
