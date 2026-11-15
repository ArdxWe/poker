import { generatePassword, digestSecret, type ClubBook, type ClubRecord } from './clubs.ts'
import type { Game } from './ledger.ts'

export class CloudOfflineError extends Error {
  constructor() {
    super('offline')
    this.name = 'CloudOfflineError'
  }
}

export type CloudSession = {
  username: string
  sessionToken: string
}

export type StoredClub = {
  id: string
  name: string
  nameKey: string
  readHash: string
  writeHash: string
  readerId: string
  writerId: string
}

export type CloudDirectory = {
  signUp(username: string, password: string): Promise<{ ok: true; id: string } | { ok: false; reason: 'taken' }>
  logIn(username: string, password: string): Promise<CloudSession | null>
  become(sessionToken: string): Promise<CloudSession | null>
  current(): CloudSession | null
  logOut(): void
  insertClub(row: Omit<StoredClub, 'id'>): Promise<{ id: string } | 'name'>
  findClub(username: string): Promise<StoredClub | null>
  insertGame(club: StoredClub, game: Game): Promise<void>
  removeGame(club: StoredClub, gameId: string): Promise<void>
  listGames(club: StoredClub): Promise<Game[]>
}

export type WriteResult = { ok: true; club: ClubRecord } | { ok: false; reason: 'denied' | 'failed' }

export type ClientCreateResult =
  | { ok: true; club: ClubRecord }
  | { ok: false; reason: 'empty' | 'same' | 'name' | 'read' | 'write' | 'failed' }

type Cache = {
  load(): ClubRecord | null
  save(club: ClubRecord | null): void
}

export type ClubClient = {
  mode: 'cloud' | 'phone'
  cached(): ClubRecord | null
  hasSession(): boolean
  list(): ClubRecord[]
  restore(): Promise<ClubRecord | null>
  refresh(club: ClubRecord): Promise<ClubRecord>
  open(readPassword: string): Promise<ClubRecord | null>
  create(input: {
    name: string
    readPassword: string
    writePassword: string
    games: readonly Game[]
  }): Promise<ClientCreateResult>
  remember(club: ClubRecord): void
  allowsWrite(club: ClubRecord, writePassword: string): Promise<boolean>
  saveGame(club: ClubRecord, game: Game, writePassword: string): Promise<WriteResult>
  deleteGame(club: ClubRecord, gameId: string, writePassword: string): Promise<WriteResult>
  importGames(club: ClubRecord, games: readonly Game[], writePassword: string): Promise<WriteResult>
}

function byNewest(games: readonly Game[]): Game[] {
  return [...games].sort((left, right) => right.playedAt.localeCompare(left.playedAt))
}

function toClub(row: StoredClub, games: readonly Game[]): ClubRecord {
  return {
    id: row.id,
    name: row.name,
    readHash: row.readHash,
    writeHash: row.writeHash,
    readerId: row.readerId,
    writerId: row.writerId,
    games: byNewest(games),
  }
}

function asStored(club: ClubRecord): StoredClub {
  return {
    id: club.id,
    name: club.name,
    nameKey: club.name.toLocaleLowerCase(),
    readHash: club.readHash,
    writeHash: club.writeHash,
    readerId: club.readerId,
    writerId: club.writerId,
  }
}

export function createCloudClient(directory: CloudDirectory, cache: Cache): ClubClient {
  async function withWriter<T>(
    club: ClubRecord,
    writePassword: string,
    run: () => Promise<T>,
  ): Promise<T | 'denied' | 'failed'> {
    const password = writePassword.trim()
    if (!password) return 'denied'
    const hash = await digestSecret(password)
    if (hash !== club.writeHash) return 'denied'
    const reader = directory.current()
    if (!reader || reader.username !== club.readHash) return 'denied'
    try {
      const writer = await directory.logIn(club.writeHash, password)
      if (!writer) return 'denied'
      return await run()
    } catch {
      return 'failed'
    } finally {
      await directory.become(reader.sessionToken).catch(() => undefined)
    }
  }

  function publish(club: ClubRecord): ClubRecord {
    cache.save(club)
    return club
  }

  return {
    mode: 'cloud',
    cached() {
      const session = directory.current()
      if (!session) return null
      const saved = cache.load()
      if (!saved || saved.readHash !== session.username) return null
      return saved
    },
    hasSession() {
      return directory.current() !== null
    },
    list() {
      return []
    },
    async restore() {
      const session = directory.current()
      if (!session) return null
      const row = await directory.findClub(session.username)
      if (!row || row.writeHash === session.username) {
        directory.logOut()
        cache.save(null)
        return null
      }
      return publish(toClub(row, await directory.listGames(row)))
    },
    async refresh(club) {
      const session = directory.current()
      if (!session || session.username !== club.readHash) return club
      const row = await directory.findClub(session.username)
      if (!row || row.readHash !== club.readHash) return club
      return publish(toClub(row, await directory.listGames(row)))
    },
    async open(readPassword) {
      const password = readPassword.trim()
      if (!password) return null
      const readHash = await digestSecret(password)
      const session = await directory.logIn(readHash, password)
      if (!session) return null
      const row = await directory.findClub(readHash)
      if (!row || row.readHash !== readHash) {
        directory.logOut()
        return null
      }
      return publish(toClub(row, await directory.listGames(row)))
    },
    async create(input) {
      const name = input.name.trim()
      const readPassword = input.readPassword.trim()
      const writePassword = input.writePassword.trim()
      if (!name || !readPassword || !writePassword) return { ok: false, reason: 'empty' }
      if (readPassword === writePassword) return { ok: false, reason: 'same' }
      const readHash = await digestSecret(readPassword)
      const writeHash = await digestSecret(writePassword)
      const nameKey = name.toLocaleLowerCase()
      try {
        const reader = await directory.signUp(readHash, readPassword)
        if (!reader.ok) return { ok: false, reason: 'read' }
        const writer = await directory.signUp(writeHash, writePassword)
        if (!writer.ok) {
          directory.logOut()
          return { ok: false, reason: 'write' }
        }
        const nameHash = await digestSecret(`name\n${nameKey}`)
        const lockPassword = `${generatePassword()}${generatePassword()}`
        const lock = await directory.signUp(nameHash, lockPassword)
        if (!lock.ok) {
          directory.logOut()
          return { ok: false, reason: 'name' }
        }
        const writerSession = await directory.logIn(writeHash, writePassword)
        if (!writerSession) {
          directory.logOut()
          return { ok: false, reason: 'failed' }
        }
        const inserted = await directory.insertClub({
          name,
          nameKey,
          readHash,
          writeHash,
          readerId: reader.id,
          writerId: writer.id,
        })
        if (inserted === 'name') {
          directory.logOut()
          return { ok: false, reason: 'name' }
        }
        const row: StoredClub = {
          id: inserted.id,
          name,
          nameKey,
          readHash,
          writeHash,
          readerId: reader.id,
          writerId: writer.id,
        }
        for (const game of byNewest(input.games)) await directory.insertGame(row, game)
        const readerSession = await directory.logIn(readHash, readPassword)
        if (!readerSession) {
          directory.logOut()
          return { ok: false, reason: 'failed' }
        }
        return { ok: true, club: publish(toClub(row, input.games)) }
      } catch {
        directory.logOut()
        return { ok: false, reason: 'failed' }
      }
    },
    remember(club) {
      cache.save(club)
    },
    async allowsWrite(club, writePassword) {
      const outcome = await withWriter(club, writePassword, async () => 'ok' as const)
      return outcome === 'ok'
    },
    async saveGame(club, game, writePassword) {
      const outcome = await withWriter(club, writePassword, async () => {
        await directory.insertGame(asStored(club), game)
        return 'ok' as const
      })
      if (outcome !== 'ok') return { ok: false, reason: outcome }
      return { ok: true, club: publish(toClub(asStored(club), [game, ...club.games])) }
    },
    async deleteGame(club, gameId, writePassword) {
      const outcome = await withWriter(club, writePassword, async () => {
        await directory.removeGame(asStored(club), gameId)
        return 'ok' as const
      })
      if (outcome !== 'ok') return { ok: false, reason: outcome }
      return {
        ok: true,
        club: publish(toClub(asStored(club), club.games.filter((game) => game.id !== gameId))),
      }
    },
    async importGames(club, games, writePassword) {
      if (club.games.length > 0 || games.length === 0) return { ok: true, club }
      const outcome = await withWriter(club, writePassword, async () => {
        const remote = await directory.listGames(asStored(club))
        if (remote.length > 0) return remote
        for (const game of byNewest(games)) await directory.insertGame(asStored(club), game)
        return byNewest(games)
      })
      if (outcome === 'denied' || outcome === 'failed') return { ok: false, reason: outcome }
      return { ok: true, club: publish(toClub(asStored(club), outcome)) }
    },
  }
}

export function createMemoryDirectory(): CloudDirectory {
  const users: { id: string; username: string; password: string; sessionToken: string }[] = []
  const clubs: StoredClub[] = []
  const games: { clubId: string; game: Game }[] = []
  let current: (typeof users)[number] | null = null
  let sequence = 0

  function requireWriter(club: StoredClub) {
    if (!current || current.id !== club.writerId) throw new Error('auth')
  }

  return {
    async signUp(username, password) {
      if (users.some((user) => user.username === username)) return { ok: false, reason: 'taken' }
      sequence += 1
      const user = { id: `u${sequence}`, username, password, sessionToken: `s${sequence}` }
      users.push(user)
      current = user
      return { ok: true, id: user.id }
    },
    async logIn(username, password) {
      const user = users.find((item) => item.username === username && item.password === password)
      if (!user) return null
      current = user
      return { username: user.username, sessionToken: user.sessionToken }
    },
    async become(sessionToken) {
      const user = users.find((item) => item.sessionToken === sessionToken) ?? null
      current = user
      return user ? { username: user.username, sessionToken: user.sessionToken } : null
    },
    current() {
      return current ? { username: current.username, sessionToken: current.sessionToken } : null
    },
    logOut() {
      current = null
    },
    async insertClub(row) {
      if (!current || current.id !== row.writerId) throw new Error('auth')
      if (clubs.some((club) => club.nameKey === row.nameKey)) return 'name'
      sequence += 1
      const club = { ...row, id: `c${sequence}` }
      clubs.push(club)
      return { id: club.id }
    },
    async findClub(username) {
      if (!current) return null
      const club = clubs.find((item) => item.readHash === username || item.writeHash === username)
      if (!club) return null
      if (current.username !== club.readHash && current.username !== club.writeHash) return null
      return club
    },
    async insertGame(club, game) {
      requireWriter(club)
      games.push({ clubId: club.id, game })
    },
    async removeGame(club, gameId) {
      requireWriter(club)
      const index = games.findIndex((item) => item.clubId === club.id && item.game.id === gameId)
      if (index >= 0) games.splice(index, 1)
    },
    async listGames(club) {
      if (!current || (current.username !== club.readHash && current.username !== club.writeHash)) throw new Error('auth')
      return games.filter((item) => item.clubId === club.id).map((item) => item.game)
    },
  }
}

export function createLocalClient(book: ClubBook): ClubClient {
  return {
    mode: 'phone',
    cached() {
      const remembered = book.remembered()
      if (remembered) return remembered
      const clubs = book.list()
      if (clubs.length !== 1) return null
      book.remember(clubs[0])
      return clubs[0]
    },
    hasSession() {
      return false
    },
    list() {
      return book.list()
    },
    async restore() {
      return this.cached()
    },
    async refresh(club) {
      return book.list().find((item) => item.readHash === club.readHash) ?? club
    },
    async open(readPassword) {
      const club = await book.open(readPassword)
      if (!club) return null
      book.remember(club)
      return club
    },
    async create(input) {
      const created = await book.create(input)
      if (!created.ok) return created
      book.remember(created.club)
      return { ok: true, club: created.club }
    },
    remember(club) {
      book.remember(club)
    },
    allowsWrite(club, writePassword) {
      return book.allowsWrite(club, writePassword)
    },
    async saveGame(club, game, writePassword) {
      if (!(await book.allowsWrite(club, writePassword))) return { ok: false, reason: 'denied' }
      const next = { ...club, games: byNewest([game, ...club.games]) }
      book.save(next)
      book.remember(next)
      return { ok: true, club: next }
    },
    async deleteGame(club, gameId, writePassword) {
      if (!(await book.allowsWrite(club, writePassword))) return { ok: false, reason: 'denied' }
      const next = { ...club, games: club.games.filter((game) => game.id !== gameId) }
      book.save(next)
      book.remember(next)
      return { ok: true, club: next }
    },
    async importGames(club, games, writePassword) {
      if (club.games.length > 0 || games.length === 0) return { ok: true, club }
      if (!(await book.allowsWrite(club, writePassword))) return { ok: false, reason: 'denied' }
      const next = { ...club, games: byNewest(games) }
      book.save(next)
      book.remember(next)
      return { ok: true, club: next }
    },
  }
}
