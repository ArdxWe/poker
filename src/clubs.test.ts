import assert from 'node:assert/strict'
import test from 'node:test'
import { createClubBook, generateClubPasswords, generatePassword } from './clubs.ts'
import type { Game } from './ledger.ts'

const sample: Game = {
  id: 'g1',
  title: 'Friday',
  playedAt: '2026-11-08T12:00:00.000Z',
  oneBuyIn: 200,
  players: [{ name: 'Alex', buyIns: 1, left: 400, net: 200 }],
}

function memoryBook() {
  const data = new Map<string, string>()
  return createClubBook({
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value)
    },
  })
}

test('a generated password is eight readable characters', () => {
  const password = generatePassword()
  assert.match(password, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/)
  const pair = generateClubPasswords()
  assert.notEqual(pair.readPassword, pair.writePassword)
})

test('a read password opens only its own club', async () => {
  const book = memoryBook()
  const created = await book.create({
    name: 'Friday night',
    readPassword: 'look',
    writePassword: 'keep',
    games: [sample],
  })
  assert.equal(created.ok, true)
  if (!created.ok) return
  const opened = await book.open('look')
  assert.equal(opened?.name, 'Friday night')
  assert.equal(opened?.games.length, 1)
  assert.equal(await book.open('other'), null)
  assert.equal(await book.allowsWrite(created.club, 'keep'), true)
  assert.equal(await book.allowsWrite(created.club, 'look'), false)
})

test('creating a club rejects a missing name or matching passwords', async () => {
  const book = memoryBook()
  assert.equal((await book.create({ name: ' ', readPassword: 'look', writePassword: 'keep', games: [] })).ok, false)
  assert.equal(
    (await book.create({ name: 'Friday night', readPassword: 'same', writePassword: 'same', games: [] })).reason,
    'same',
  )
})

test('the same read password cannot open a second club', async () => {
  const book = memoryBook()
  await book.create({ name: 'Friday night', readPassword: 'look', writePassword: 'keep', games: [] })
  const sameRead = await book.create({ name: 'Saturday', readPassword: 'look', writePassword: 'other', games: [sample] })
  assert.equal(sameRead.ok, false)
  if (sameRead.ok) return
  assert.equal(sameRead.reason, 'read')
  const sameWrite = await book.create({ name: 'Sunday', readPassword: 'fresh', writePassword: 'keep', games: [] })
  assert.equal(sameWrite.ok, false)
  if (sameWrite.ok) return
  assert.equal(sameWrite.reason, 'write')
  const sameName = await book.create({ name: 'friday night', readPassword: 'alpha', writePassword: 'beta', games: [] })
  assert.equal(sameName.ok, false)
  if (sameName.ok) return
  assert.equal(sameName.reason, 'name')
  assert.equal((await book.open('look'))?.games.length, 0)
})
