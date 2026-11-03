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
