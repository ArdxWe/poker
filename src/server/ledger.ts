import { digestSecret } from '../clubs.ts'
import type { Game } from '../ledger.ts'
import { readStoredGame } from '../storage.ts'

export type ClubStore = {
  get(key: string): Promise<string | null>
  setNew(key: string, value: string): Promise<boolean>
  set(key: string, value: string): Promise<void>
  delete(key: string): Promise<void>
  list(prefix: string): Promise<string[]>
}

type ClubRow = {
  id: string
  name: string
  nameKey: string
  readHash: string
  writeHash: string
  readerId: string
  writerId: string
  games: Game[]
}

export type ClubResponse =
  | { ok: true; token: string; club: ClubRow }
  | { ok: false; reason: 'empty' | 'same' | 'name' | 'read' | 'write' | 'denied' | 'missing' | 'failed' }

function byNewest(games: readonly Game[]): Game[] {
  return [...games].sort((left, right) => right.playedAt.localeCompare(left.playedAt))
}

function readGames(value: unknown): Game[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((game) => {
    const normalized = readStoredGame(game)
    return normalized ? [normalized] : []
  })
}

async function token(): Promise<string> {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function loadClub(store: ClubStore, readHash: string): Promise<ClubRow | null> {
  const raw = await store.get(`club/${readHash}`)
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const record = parsed as { id?: unknown; name?: unknown; nameKey?: unknown; readHash?: unknown; writeHash?: unknown }
  if (typeof record.name !== 'string' || record.readHash !== readHash || typeof record.writeHash !== 'string') return null
  const keys = await store.list(`game/${readHash}/`)
  const games: Game[] = []
  for (const key of keys) {
    const gameRaw = await store.get(key)
    if (!gameRaw) continue
    try {
      const game = readStoredGame(JSON.parse(gameRaw))
      if (game) games.push(game)
    } catch {
      continue
    }
  }
  return {
    id: typeof record.id === 'string' ? record.id : readHash,
    name: record.name,
    nameKey: typeof record.nameKey === 'string' ? record.nameKey : record.name.toLocaleLowerCase(),
    readHash,
    writeHash: record.writeHash,
    readerId: '',
    writerId: '',
    games: byNewest(games),
  }
}

async function openSession(store: ClubStore, readHash: string): Promise<ClubResponse> {
  const club = await loadClub(store, readHash)
  if (!club) return { ok: false, reason: 'missing' }
  const session = await token()
  await store.set(`session/${session}`, readHash)
  return { ok: true, token: session, club }
}

async function sessionClub(store: ClubStore, session: unknown): Promise<ClubRow | null> {
  if (typeof session !== 'string' || !session) return null
  const readHash = await store.get(`session/${session}`)
  if (!readHash) return null
  return loadClub(store, readHash)
}

export async function handleClubRequest(store: ClubStore, body: unknown): Promise<ClubResponse> {
  if (!body || typeof body !== 'object') return { ok: false, reason: 'failed' }
  const request = body as {
    op?: unknown
    name?: unknown
    readPassword?: unknown
    writePassword?: unknown
    games?: unknown
    token?: unknown
    game?: unknown
    gameId?: unknown
  }
  if (request.op === 'create') {
    const name = typeof request.name === 'string' ? request.name.trim() : ''
    const password = typeof request.readPassword === 'string' ? request.readPassword.trim() : ''
    if (!name || !password) return { ok: false, reason: 'empty' }
    const readHash = await digestSecret(password)
    const nameKey = name.toLocaleLowerCase()
    const nameLock = `name/${await digestSecret(nameKey)}`
    if (!(await store.setNew(nameLock, readHash))) return { ok: false, reason: 'name' }
    if (!(await store.setNew(`secret/${readHash}`, 'club'))) {
      await store.delete(nameLock)
      return { ok: false, reason: 'read' }
    }
    await store.set(
      `club/${readHash}`,
      JSON.stringify({ id: readHash, name, nameKey, readHash, writeHash: readHash }),
    )
    for (const game of readGames(request.games)) {
      await store.set(`game/${readHash}/${game.id}`, JSON.stringify(game))
    }
    return openSession(store, readHash)
  }
  if (request.op === 'open') {
    if (typeof request.readPassword !== 'string' || !request.readPassword.trim()) return { ok: false, reason: 'missing' }
    return openSession(store, await digestSecret(request.readPassword))
  }
  if (request.op === 'restore' || request.op === 'refresh') {
    const club = await sessionClub(store, request.token)
    if (!club || typeof request.token !== 'string') return { ok: false, reason: 'missing' }
    return { ok: true, token: request.token, club }
  }
  if (request.op === 'unlock' || request.op === 'save' || request.op === 'delete' || request.op === 'import') {
    const club = await sessionClub(store, request.token)
    if (!club || typeof request.token !== 'string') return { ok: false, reason: 'missing' }
    if (request.op === 'save') {
      const game = readStoredGame(request.game)
      if (!game) return { ok: false, reason: 'failed' }
      await store.set(`game/${club.readHash}/${game.id}`, JSON.stringify(game))
    } else if (request.op === 'delete') {
      if (typeof request.gameId !== 'string' || !request.gameId) return { ok: false, reason: 'failed' }
      await store.delete(`game/${club.readHash}/${request.gameId}`)
    } else if (request.op === 'import') {
      const existing = await store.list(`game/${club.readHash}/`)
      if (existing.length === 0) {
        for (const game of readGames(request.games)) {
          await store.set(`game/${club.readHash}/${game.id}`, JSON.stringify(game))
        }
      }
    }
    const next = await loadClub(store, club.readHash)
    if (!next) return { ok: false, reason: 'failed' }
    return { ok: true, token: request.token, club: next }
  }
  return { ok: false, reason: 'failed' }
}

export function createMemoryClubStore(): ClubStore {
  const data = new Map<string, string>()
  return {
    async get(key) {
      return data.get(key) ?? null
    },
    async setNew(key, value) {
      if (data.has(key)) return false
      data.set(key, value)
      return true
    },
    async set(key, value) {
      data.set(key, value)
    },
    async delete(key) {
      data.delete(key)
    },
    async list(prefix) {
      return [...data.keys()].filter((key) => key.startsWith(prefix))
    },
  }
}
