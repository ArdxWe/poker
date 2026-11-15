import { ACL, Object as CloudObject, Query, User, init } from 'leancloud-storage'
import { CloudOfflineError, createCloudClient, createLocalClient, type CloudDirectory, type CloudSession, type StoredClub } from './cloud.ts'
import { browserClubs } from './clubs.ts'
import type { Game } from './ledger.ts'
import { loadCloudCache, loadClub, readStoredGame, saveCloudCache } from './storage.ts'

export type CloudConfig = {
  appId: string
  appKey: string
  serverURL: string
}

let configuredKey = ''

export function readCloudConfig(): CloudConfig | null {
  const appId = import.meta.env.VITE_LEANCLOUD_APP_ID?.trim() ?? ''
  const appKey = import.meta.env.VITE_LEANCLOUD_APP_KEY?.trim() ?? ''
  const serverURL = import.meta.env.VITE_LEANCLOUD_SERVER_URL?.trim() ?? ''
  if (!appId || !appKey || !serverURL) return null
  return { appId, appKey, serverURL }
}

export function gamesWaitingForCloud(): Game[] {
  const phone = loadClub()
  if (phone.length > 0 || !readCloudConfig()) return phone
  const remembered = browserClubs.remembered()
  if (remembered) return remembered.games
  const clubs = browserClubs.list()
  return clubs.length === 1 ? clubs[0].games : []
}

export function createBrowserClubClient() {
  const config = readCloudConfig()
  if (!config) return createLocalClient(browserClubs)
  return createCloudClient(createLeanCloudDirectory(config), {
    load: loadCloudCache,
    save: saveCloudCache,
  })
}

export function createLeanCloudDirectory(config: CloudConfig): CloudDirectory {
  const key = `${config.appId}\n${config.serverURL}`
  if (configuredKey !== key) {
    init({ appId: config.appId, appKey: config.appKey, serverURL: config.serverURL })
    configuredKey = key
  }
  return {
    signUp,
    logIn,
    become,
    current: currentSession,
    logOut() {
      void User.logOut()
    },
    insertClub,
    findClub,
    insertGame,
    removeGame,
    listGames,
  }
}

function errorCode(error: unknown): number | null {
  if (!error || typeof error !== 'object' || !('code' in error)) return null
  const code = (error as { code?: unknown }).code
  return typeof code === 'number' ? code : null
}

function raise(error: unknown): never {
  const code = errorCode(error)
  if (code === 100 || code === null) throw new CloudOfflineError()
  throw error instanceof Error ? error : new Error('Cloud request failed')
}

async function signUp(username: string, password: string): Promise<{ ok: true; id: string } | { ok: false; reason: 'taken' }> {
  const user = new User()
  user.setUsername(username)
  user.setPassword(password)
  try {
    const saved = await user.signUp()
    if (!saved.id) throw new Error('Missing user id')
    return { ok: true, id: saved.id }
  } catch (error) {
    if (errorCode(error) === 202) return { ok: false, reason: 'taken' }
    raise(error)
  }
}

async function logIn(username: string, password: string): Promise<CloudSession | null> {
  try {
    const user = await User.logIn(username, password)
    return sessionFrom(user)
  } catch (error) {
    const code = errorCode(error)
    if (code === 101 || code === 210 || code === 211) return null
    raise(error)
  }
}

async function become(sessionToken: string): Promise<CloudSession | null> {
  try {
    const user = await User.become(sessionToken)
    return sessionFrom(user)
  } catch (error) {
    const code = errorCode(error)
    if (code === 101 || code === 209 || code === 211) return null
    raise(error)
  }
}

function currentSession(): CloudSession | null {
  const user = User.current() as User | null
  if (!user) return null
  return sessionFrom(user)
}

function sessionFrom(user: User): CloudSession | null {
  const username = user.getUsername()
  const sessionToken = user.getSessionToken()
  if (!username || !sessionToken) return null
  return { username, sessionToken }
}

function clubAcl(readerId: string, writerId: string): ACL {
  const acl = new ACL()
  acl.setPublicReadAccess(false)
  acl.setPublicWriteAccess(false)
  acl.setReadAccess(readerId, true)
  acl.setReadAccess(writerId, true)
  acl.setWriteAccess(writerId, true)
  return acl
}

async function insertClub(row: Omit<StoredClub, 'id'>): Promise<{ id: string } | 'name'> {
  const club = new CloudObject('Club')
  club.set('name', row.name)
  club.set('nameKey', row.nameKey)
  club.set('readHash', row.readHash)
  club.set('writeHash', row.writeHash)
  club.set('readerId', row.readerId)
  club.set('writerId', row.writerId)
  club.setACL(clubAcl(row.readerId, row.writerId))
  try {
    const saved = await club.save()
    if (!saved.id) throw new Error('Missing club id')
    return { id: saved.id }
  } catch (error) {
    if (errorCode(error) === 137) return 'name'
    raise(error)
  }
}

function stringField(object: CloudObject, key: string): string {
  const value = object.get(key)
  return typeof value === 'string' ? value : ''
}

function readClub(object: CloudObject): StoredClub | null {
  const id = object.id ?? ''
  const name = stringField(object, 'name')
  const nameKey = stringField(object, 'nameKey')
  const readHash = stringField(object, 'readHash')
  const writeHash = stringField(object, 'writeHash')
  const readerId = stringField(object, 'readerId')
  const writerId = stringField(object, 'writerId')
  if (!id || !name || !nameKey || !readHash || !writeHash || !readerId || !writerId) return null
  return { id, name, nameKey, readHash, writeHash, readerId, writerId }
}

async function findClub(username: string): Promise<StoredClub | null> {
  try {
    const byRead = new Query<CloudObject>('Club')
    byRead.equalTo('readHash', username)
    const byWrite = new Query<CloudObject>('Club')
    byWrite.equalTo('writeHash', username)
    const found = await Query.or(byRead, byWrite).first()
    return found ? readClub(found) : null
  } catch (error) {
    raise(error)
  }
}

async function insertGame(club: StoredClub, game: Game): Promise<void> {
  const row = new CloudObject('Game')
  row.set('club', CloudObject.createWithoutData('Club', club.id))
  row.set('gameId', game.id)
  row.set('title', game.title)
  row.set('playedAt', game.playedAt)
  row.set('oneBuyIn', game.oneBuyIn)
  row.set('players', game.players)
  row.setACL(clubAcl(club.readerId, club.writerId))
  try {
    await row.save()
  } catch (error) {
    raise(error)
  }
}

async function removeGame(club: StoredClub, gameId: string): Promise<void> {
  try {
    const query = new Query<CloudObject>('Game')
    query.equalTo('club', CloudObject.createWithoutData('Club', club.id))
    query.equalTo('gameId', gameId)
    const found = await query.first()
    if (found) await found.destroy()
  } catch (error) {
    raise(error)
  }
}

async function listGames(club: StoredClub): Promise<Game[]> {
  try {
    const query = new Query<CloudObject>('Game')
    query.equalTo('club', CloudObject.createWithoutData('Club', club.id))
    query.descending('playedAt')
    query.limit(1000)
    const rows = await query.find()
    return rows.flatMap((row) => {
      const game = readStoredGame({
        id: row.get('gameId'),
        title: row.get('title'),
        playedAt: row.get('playedAt'),
        oneBuyIn: row.get('oneBuyIn'),
        players: row.get('players'),
      })
      return game ? [game] : []
    })
  } catch (error) {
    raise(error)
  }
}
