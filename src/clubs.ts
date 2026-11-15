import type { Game } from './ledger'

export type ClubRecord = {
  id: string
  name: string
  readHash: string
  writeHash: string
  readerId: string
  writerId: string
  games: Game[]
}

type Store = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

const CLUBS_KEY = 'felt.clubs.v1'
const OPEN_KEY = 'felt.club.open.v1'

export type CreateClubResult =
  | { ok: true; club: ClubRecord }
  | { ok: false; reason: 'empty' | 'same' | 'name' | 'read' | 'write' }

const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generatePassword(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return [...bytes].map((byte) => PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length]).join('')
}

export function generateClubPasswords(): { readPassword: string; writePassword: string } {
  const readPassword = generatePassword()
  let writePassword = generatePassword()
  while (writePassword === readPassword) writePassword = generatePassword()
  return { readPassword, writePassword }
}

export async function digestSecret(secret: string): Promise<string> {
  const data = new TextEncoder().encode(secret.trim())
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function createClubBook(store: Store) {
  function readAll(): ClubRecord[] {
    try {
      const raw = store.getItem(CLUBS_KEY)
      if (!raw) return []
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      return parsed.flatMap((club) => {
        const normalized = normalizeClub(club)
        return normalized ? [normalized] : []
      })
    } catch {
      return []
    }
  }

  function writeAll(clubs: readonly ClubRecord[]) {
    store.setItem(CLUBS_KEY, JSON.stringify(clubs))
  }

  return {
    list(): ClubRecord[] {
      return readAll()
    },
    remembered(): ClubRecord | null {
      const readHash = store.getItem(OPEN_KEY)
      if (!readHash) return null
      return readAll().find((club) => club.readHash === readHash) ?? null
    },
    remember(club: ClubRecord) {
      store.setItem(OPEN_KEY, club.readHash)
    },
    forget() {
      store.setItem(OPEN_KEY, '')
    },
    clear() {
      store.setItem(CLUBS_KEY, '[]')
      store.setItem(OPEN_KEY, '')
    },
    async open(readPassword: string): Promise<ClubRecord | null> {
      if (!readPassword.trim()) return null
      const readHash = await digestSecret(readPassword)
      return readAll().find((club) => club.readHash === readHash) ?? null
    },
    async create(input: {
      name: string
      readPassword: string
      writePassword: string
      games: readonly Game[]
    }): Promise<CreateClubResult> {
      const name = input.name.trim()
      const readPassword = input.readPassword.trim()
      const writePassword = input.writePassword.trim()
      if (!name || !readPassword || !writePassword) return { ok: false, reason: 'empty' }
      if (readPassword === writePassword) return { ok: false, reason: 'same' }
      const readHash = await digestSecret(readPassword)
      const writeHash = await digestSecret(writePassword)
      const clubs = readAll()
      const nameKey = name.toLocaleLowerCase()
      if (clubs.some((club) => club.name.toLocaleLowerCase() === nameKey)) return { ok: false, reason: 'name' }
      const hashes = clubs.flatMap((club) => [club.readHash, club.writeHash])
      if (hashes.includes(readHash)) return { ok: false, reason: 'read' }
      if (hashes.includes(writeHash)) return { ok: false, reason: 'write' }
      const club: ClubRecord = {
        id: readHash,
        name,
        readHash,
        writeHash,
        readerId: '',
        writerId: '',
        games: [...input.games],
      }
      writeAll([...clubs, club])
      return { ok: true, club }
    },
    async allowsWrite(club: ClubRecord, writePassword: string): Promise<boolean> {
      if (!writePassword.trim()) return false
      return (await digestSecret(writePassword)) === club.writeHash
    },
    save(club: ClubRecord) {
      const clubs = readAll()
      writeAll(clubs.map((current) => (current.readHash === club.readHash ? club : current)))
    },
  }
}

function normalizeClub(value: unknown): ClubRecord | null {
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
  if (!name || typeof record.readHash !== 'string' || typeof record.writeHash !== 'string') return null
  if (!Array.isArray(record.games)) return null
  return {
    id: typeof record.id === 'string' && record.id ? record.id : record.readHash,
    name,
    readHash: record.readHash,
    writeHash: record.writeHash,
    readerId: typeof record.readerId === 'string' ? record.readerId : '',
    writerId: typeof record.writerId === 'string' ? record.writerId : '',
    games: record.games as Game[],
  }
}

export type ClubBook = ReturnType<typeof createClubBook>

export const browserClubs = createClubBook({
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
})
