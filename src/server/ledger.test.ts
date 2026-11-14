import assert from 'node:assert/strict'
import test from 'node:test'
import type { Game } from '../ledger.ts'
import { createMemoryClubStore, handleClubRequest } from './ledger.ts'

const sample: Game = {
  id: 'g1',
  title: 'Friday',
  playedAt: '2026-11-08T12:00:00.000Z',
  oneBuyIn: 200,
  players: [{ name: 'Alex', buyIns: 1, left: 400, net: 200 }],
}

test('a club and its games stay on the server', async () => {
  const store = createMemoryClubStore()
  const created = await handleClubRequest(store, {
    op: 'create',
    name: 'Friday night',
    readPassword: 'look',
    games: [sample],
  })
  assert.equal(created.ok, true)
  if (!created.ok) return
  const opened = await handleClubRequest(store, { op: 'open', readPassword: 'look' })
  assert.equal(opened.ok, true)
  if (!opened.ok) return
  assert.equal(opened.club.name, 'Friday night')
  assert.equal(opened.club.games.length, 1)
  assert.equal((await handleClubRequest(store, { op: 'open', readPassword: 'nope' })).ok, false)
  const saved = await handleClubRequest(store, {
    op: 'save',
    token: opened.token,
    game: { ...sample, id: 'g2', playedAt: '2026-11-09T12:00:00.000Z' },
  })
  assert.equal(saved.ok, true)
  if (!saved.ok) return
  assert.equal(saved.club.games[0]?.id, 'g2')
  const again = await handleClubRequest(store, { op: 'restore', token: opened.token })
  assert.equal(again.ok, true)
  if (!again.ok) return
  assert.equal(again.club.games.length, 2)
})

test('server names and passwords stay unique', async () => {
  const store = createMemoryClubStore()
  await handleClubRequest(store, {
    op: 'create',
    name: 'Friday night',
    readPassword: 'look',
    games: [],
  })
  const sameName = await handleClubRequest(store, {
    op: 'create',
    name: 'friday night',
    readPassword: 'alpha',
    games: [],
  })
  assert.equal(sameName.ok, false)
  if (sameName.ok) return
  assert.equal(sameName.reason, 'name')
  const samePassword = await handleClubRequest(store, {
    op: 'create',
    name: 'Saturday',
    readPassword: 'look',
    games: [],
  })
  assert.equal(samePassword.ok, false)
  if (samePassword.ok) return
  assert.equal(samePassword.reason, 'read')
})

test('a club that already has games ignores a second phone', async () => {
  const store = createMemoryClubStore()
  const created = await handleClubRequest(store, {
    op: 'create',
    name: 'Friday night',
    readPassword: 'look',
    games: [sample],
  })
  assert.equal(created.ok, true)
  if (!created.ok) return
  const imported = await handleClubRequest(store, {
    op: 'import',
    token: created.token,
    games: [{ ...sample, id: 'local' }],
  })
  assert.equal(imported.ok, true)
  if (!imported.ok) return
  assert.equal(imported.club.games.length, 1)
  assert.equal(imported.club.games[0]?.id, 'g1')
})
