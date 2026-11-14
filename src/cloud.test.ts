import assert from 'node:assert/strict'
import test from 'node:test'
import { CloudOfflineError, createCloudClient, createMemoryDirectory, type CloudDirectory, type StoredClub } from './cloud.ts'
import { digestSecret, type ClubRecord } from './clubs.ts'
import type { Game } from './ledger.ts'

const sample: Game = {
  id: 'g1',
  title: 'Friday',
  playedAt: '2026-11-08T12:00:00.000Z',
  oneBuyIn: 200,
  players: [{ name: 'Alex', buyIns: 1, left: 400, net: 200 }],
}

function memoryCache() {
  let value: ClubRecord | null = null
  return {
    load: () => value,
    save(club: ClubRecord | null) {
      value = club
    },
  }
}

function client() {
  const directory = createMemoryDirectory()
  return { directory, clubs: createCloudClient(directory, memoryCache()) }
}

test('a read password opens the club and cannot write', async () => {
  const { clubs } = client()
  const created = await clubs.create({
    name: 'Friday night',
    readPassword: 'look',
    writePassword: 'keep',
    games: [sample],
  })
  assert.equal(created.ok, true)
  if (!created.ok) return
  const opened = await clubs.open('look')
  assert.equal(opened?.name, 'Friday night')
  assert.equal(opened?.games.length, 1)
  assert.equal(await clubs.open('other'), null)
  const denied = await clubs.saveGame(created.club, { ...sample, id: 'g2' }, 'look')
  assert.equal(denied.ok, false)
  assert.equal((await clubs.open('look'))?.games.length, 1)
  const saved = await clubs.saveGame(created.club, { ...sample, id: 'g2', playedAt: '2026-11-09T12:00:00.000Z' }, 'keep')
  assert.equal(saved.ok, true)
  if (!saved.ok) return
  assert.equal(saved.club.games[0]?.id, 'g2')
  const kept = await clubs.deleteGame(saved.club, 'g2', 'look')
  assert.equal(kept.ok, false)
  assert.equal((await clubs.open('look'))?.games.length, 2)
})

test('club name and passwords stay unique', async () => {
  const { clubs } = client()
  await clubs.create({ name: 'Friday night', readPassword: 'look', writePassword: 'keep', games: [] })
  const sameName = await clubs.create({ name: 'friday night', readPassword: 'alpha', writePassword: 'beta', games: [] })
  assert.equal(sameName.ok, false)
  if (sameName.ok) return
  assert.equal(sameName.reason, 'name')
  const sameRead = await clubs.create({ name: 'Saturday', readPassword: 'look', writePassword: 'other', games: [] })
  assert.equal(sameRead.ok, false)
  if (sameRead.ok) return
  assert.equal(sameRead.reason, 'read')
  const sameWrite = await clubs.create({ name: 'Sunday', readPassword: 'fresh', writePassword: 'keep', games: [] })
  assert.equal(sameWrite.ok, false)
  if (sameWrite.ok) return
  assert.equal(sameWrite.reason, 'write')
  assert.equal((await clubs.create({ name: ' ', readPassword: 'a', writePassword: 'b', games: [] })).reason, 'empty')
})

test('a later phone does not replace games already stored', async () => {
  const { clubs } = client()
  const created = await clubs.create({
    name: 'Friday night',
    readPassword: 'look',
    writePassword: 'keep',
    games: [sample],
  })
  assert.equal(created.ok, true)
  if (!created.ok) return
  const imported = await clubs.importGames(created.club, [{ ...sample, id: 'local' }], 'keep')
  assert.equal(imported.ok, true)
  if (!imported.ok) return
  assert.equal(imported.club.games.length, 1)
  assert.equal(imported.club.games[0]?.id, 'g1')
})

test('an empty club takes this phone once the write password matches', async () => {
  const { clubs } = client()
  const created = await clubs.create({ name: 'Friday night', readPassword: 'look', writePassword: 'keep', games: [] })
  assert.equal(created.ok, true)
  if (!created.ok) return
  const denied = await clubs.importGames(created.club, [sample], 'look')
  assert.equal(denied.ok, false)
  const imported = await clubs.importGames(created.club, [sample], 'keep')
  assert.equal(imported.ok, true)
  if (!imported.ok) return
  assert.equal(imported.club.games.length, 1)
  assert.equal((await clubs.open('look'))?.games.length, 1)
})

test('a write session is not restored', async () => {
  const { directory, clubs } = client()
  await clubs.create({ name: 'Friday night', readPassword: 'look', writePassword: 'keep', games: [] })
  await directory.logIn(await digestSecret('keep'), 'keep')
  assert.equal(await clubs.restore(), null)
  assert.equal(directory.current(), null)
})

test('a failed refresh leaves the saved club in place', async () => {
  let offline = false
  const inner = createMemoryDirectory()
  const directory: CloudDirectory = {
    ...inner,
    async listGames(club: StoredClub) {
      if (offline) throw new CloudOfflineError()
      return inner.listGames(club)
    },
  }
  const cache = memoryCache()
  const clubs = createCloudClient(directory, cache)
  const created = await clubs.create({ name: 'Friday night', readPassword: 'look', writePassword: 'keep', games: [sample] })
  assert.equal(created.ok, true)
  offline = true
  await assert.rejects(() => clubs.refresh(cache.load()!), CloudOfflineError)
  assert.equal(cache.load()?.games.length, 1)
})
