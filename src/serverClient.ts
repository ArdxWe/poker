import { browserClubs, type ClubRecord } from './clubs'
import { CloudOfflineError, type ClientCreateResult, type ClubClient, type WriteResult } from './cloud'
import type { Game } from './ledger'
import { loadClub, saveClub, saveCloudCache } from './storage'
import type { ClubResponse } from './server/ledger'

const TOKEN_KEY = 'felt.server.token.v1'

function readToken(): string {
  try {
    return sessionStorage.getItem(TOKEN_KEY) ?? ''
  } catch {
    return ''
  }
}

function writeToken(token: string) {
  sessionStorage.setItem(TOKEN_KEY, token)
}

function clearToken() {
  sessionStorage.removeItem(TOKEN_KEY)
}

async function post(body: unknown): Promise<ClubResponse> {
  let response: Response
  try {
    response = await fetch('/api/club', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new CloudOfflineError()
  }
  if (!response.ok) throw new CloudOfflineError()
  return response.json() as Promise<ClubResponse>
}

function asClub(club: ClubResponse & { ok: true }): ClubRecord {
  return club.club
}

export function legacyClubName(): string {
  const remembered = browserClubs.remembered()
  if (remembered?.name) return remembered.name
  const clubs = browserClubs.list()
  return clubs.length === 1 ? clubs[0].name : ''
}

export function legacyGames(): Game[] {
  const phone = loadClub()
  if (phone.length > 0) return phone
  const remembered = browserClubs.remembered()
  if (remembered && remembered.games.length > 0) return remembered.games
  const clubs = browserClubs.list()
  return clubs.length === 1 ? clubs[0].games : []
}

export function clearLegacyGames() {
  saveClub([])
  saveCloudCache(null)
  browserClubs.clear()
}

export function createBrowserClubClient(): ClubClient {
  return {
    mode: 'cloud',
    cached() {
      return null
    },
    hasSession() {
      return readToken().length > 0
    },
    list() {
      return []
    },
    async restore() {
      const token = readToken()
      if (!token) return null
      const result = await post({ op: 'restore', token })
      if (!result.ok) {
        clearToken()
        return null
      }
      writeToken(result.token)
      return asClub(result)
    },
    async refresh(club) {
      const token = readToken()
      if (!token) return club
      const result = await post({ op: 'refresh', token })
      if (!result.ok) return club
      return asClub(result)
    },
    async open(readPassword) {
      const result = await post({ op: 'open', readPassword })
      if (!result.ok) return null
      writeToken(result.token)
      return asClub(result)
    },
    async create(input): Promise<ClientCreateResult> {
      const result = await post({ op: 'create', ...input })
      if (!result.ok) {
        if (
          result.reason === 'empty' ||
          result.reason === 'same' ||
          result.reason === 'name' ||
          result.reason === 'read' ||
          result.reason === 'write'
        ) {
          return { ok: false, reason: result.reason }
        }
        return { ok: false, reason: 'failed' }
      }
      writeToken(result.token)
      return { ok: true, club: asClub(result) }
    },
    remember() {},
    async allowsWrite(_club, writePassword) {
      const token = readToken()
      if (!token) return false
      const result = await post({ op: 'unlock', token, writePassword })
      return result.ok
    },
    async saveGame(_club, game, writePassword): Promise<WriteResult> {
      const token = readToken()
      if (!token) return { ok: false, reason: 'denied' }
      const result = await post({ op: 'save', token, writePassword, game })
      if (!result.ok) return { ok: false, reason: result.reason === 'denied' ? 'denied' : 'failed' }
      return { ok: true, club: asClub(result) }
    },
    async deleteGame(_club, gameId, writePassword): Promise<WriteResult> {
      const token = readToken()
      if (!token) return { ok: false, reason: 'denied' }
      const result = await post({ op: 'delete', token, writePassword, gameId })
      if (!result.ok) return { ok: false, reason: result.reason === 'denied' ? 'denied' : 'failed' }
      return { ok: true, club: asClub(result) }
    },
    async importGames(_club, games, writePassword): Promise<WriteResult> {
      const token = readToken()
      if (!token) return { ok: false, reason: 'denied' }
      const result = await post({ op: 'import', token, writePassword, games })
      if (!result.ok) return { ok: false, reason: result.reason === 'denied' ? 'denied' : 'failed' }
      return { ok: true, club: asClub(result) }
    },
  }
}
