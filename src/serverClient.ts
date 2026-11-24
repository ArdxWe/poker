import { browserClubs, type ClubRecord } from './clubs'
import { CloudOfflineError, type ClientCreateResult, type ClubClient, type WriteResult } from './cloud'
import type { Game } from './ledger'
import { loadClub, saveClub, saveCloudCache } from './storage'
import type { ClubResponse } from './server/ledger'

const TOKEN_KEY = 'felt.server.token.v1'
const ISSUED_KEY = 'felt.server.issued.v1'
const CLUB_KEY = 'felt.server.club.v1'

let generation = 0

export function clubGeneration(): number {
  return generation
}

function noteClubChange() {
  generation += 1
}

function rememberedToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? ''
  } catch {
    return ''
  }
}

function readToken(): string {
  try {
    return sessionStorage.getItem(TOKEN_KEY) ?? rememberedToken()
  } catch {
    return rememberedToken()
  }
}

function writeToken(token: string, remember = true) {
  sessionStorage.setItem(TOKEN_KEY, token)
  if (remember) {
    try {
      localStorage.setItem(TOKEN_KEY, token)
    } catch {
      // The current tab can still use its session.
    }
  }
}

function clearToken(token: string) {
  sessionStorage.removeItem(TOKEN_KEY)
  sessionStorage.removeItem(CLUB_KEY)
  try {
    if (rememberedToken() === token) {
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(CLUB_KEY)
    }
  } catch {
    // The current tab's session has already been cleared.
  }
}

export function pendingPassword(): string | null {
  try {
    const password = sessionStorage.getItem(ISSUED_KEY)
    if (password) return password
  } catch {
    // Fall through to the remembered password.
  }
  try {
    const password = localStorage.getItem(ISSUED_KEY)
    return password ? password : null
  } catch {
    return null
  }
}

export function clearPendingPassword() {
  try {
    sessionStorage.removeItem(ISSUED_KEY)
  } catch {
    // sessionStorage can throw when storage is blocked.
  }
  try {
    localStorage.removeItem(ISSUED_KEY)
  } catch {
    // The current tab has already dropped the password.
  }
}

function writePendingPassword(password: string) {
  sessionStorage.setItem(ISSUED_KEY, password)
  try {
    localStorage.setItem(ISSUED_KEY, password)
  } catch {
    // The current tab can still show the password.
  }
}

function readStoredClub(storage: Storage): ClubRecord | null {
  try {
    const raw = storage.getItem(CLUB_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    const club = parsed as ClubRecord
    if (typeof club.name !== 'string' || !club.name || !Array.isArray(club.games)) return null
    return club
  } catch {
    return null
  }
}

function readCachedClub(): ClubRecord | null {
  const sessionClub = readStoredClub(sessionStorage)
  if (sessionClub) return sessionClub
  try {
    const sessionToken = sessionStorage.getItem(TOKEN_KEY)
    if (sessionToken && sessionToken !== rememberedToken()) return null
  } catch {
    // No session token is available, so use the remembered club.
  }
  return readStoredClub(localStorage)
}

function rememberClub(club: ClubRecord): ClubRecord {
  const raw = JSON.stringify(club)
  sessionStorage.setItem(CLUB_KEY, raw)
  try {
    if (sessionStorage.getItem(TOKEN_KEY) === rememberedToken()) localStorage.setItem(CLUB_KEY, raw)
  } catch {
    // The current tab can still use its session.
  }
  return club
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
      if (!readToken()) return null
      return readCachedClub()
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
      const seen = clubGeneration()
      const result = await post({ op: 'restore', token })
      // This tab opened or edited a club while the request was in flight.
      if (seen !== clubGeneration()) return readToken() ? readCachedClub() : null
      if (!result.ok) {
        clearToken(token)
        return null
      }
      writeToken(result.token, !rememberedToken())
      return rememberClub(asClub(result))
    },
    async refresh(club) {
      const token = readToken()
      if (!token) return club
      const result = await post({ op: 'refresh', token })
      if (!result.ok) return club
      noteClubChange()
      return rememberClub(asClub(result))
    },
    async open(readPassword) {
      const result = await post({ op: 'open', readPassword })
      if (!result.ok) return null
      noteClubChange()
      writeToken(result.token)
      return rememberClub(asClub(result))
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
      const club = asClub(result)
      noteClubChange()
      writePendingPassword(input.readPassword)
      writeToken(result.token)
      return { ok: true, club: rememberClub(club) }
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
      noteClubChange()
      return { ok: true, club: rememberClub(asClub(result)) }
    },
    async deleteGame(_club, gameId, writePassword): Promise<WriteResult> {
      const token = readToken()
      if (!token) return { ok: false, reason: 'denied' }
      const result = await post({ op: 'delete', token, writePassword, gameId })
      if (!result.ok) return { ok: false, reason: result.reason === 'denied' ? 'denied' : 'failed' }
      noteClubChange()
      return { ok: true, club: rememberClub(asClub(result)) }
    },
    async importGames(_club, games, writePassword): Promise<WriteResult> {
      const token = readToken()
      if (!token) return { ok: false, reason: 'denied' }
      const result = await post({ op: 'import', token, writePassword, games })
      if (!result.ok) return { ok: false, reason: result.reason === 'denied' ? 'denied' : 'failed' }
      noteClubChange()
      return { ok: true, club: rememberClub(asClub(result)) }
    },
  }
}
