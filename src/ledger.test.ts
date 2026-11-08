import assert from 'node:assert/strict'
import test from 'node:test'
import {
  chipsLeft,
  formatSigned,
  newId,
  playerNet,
  recordGame,
  standings,
  summarize,
  type Player,
  type Session,
} from './ledger.ts'

const alex: Player = { id: 'a', name: 'Alex', buyIns: 3, left: 450 }
const sam: Player = { id: 's', name: 'Sam', buyIns: 1, left: 350 }

test('net is stack minus buy-ins times the unit', () => {
  assert.equal(playerNet(alex, 200), -150)
  assert.equal(playerNet(sam, 200), 150)
})

test('off by compares chips left with chips bought', () => {
  const session: Session = { oneBuyIn: 200, players: [alex, sam] }
  assert.deepEqual(summarize(session), {
    totalBuyIns: 4,
    totalIn: 800,
    totalLeft: 800,
    offBy: 0,
  })
})

test('a missing stack shows up as off by', () => {
  const session: Session = {
    oneBuyIn: 100,
    players: [{ id: 'a', name: 'Alex', buyIns: 2, left: 100 }],
  }
  assert.equal(summarize(session).offBy, -100)
})

test('an empty or partial stack does not become zero', () => {
  assert.equal(chipsLeft(''), null)
  assert.equal(chipsLeft(' '), null)
  assert.equal(chipsLeft('1.'), null)
  assert.equal(chipsLeft('1e2'), null)
  assert.equal(chipsLeft('0'), 0)
  assert.equal(chipsLeft('1200'), 1200)
})

test('a cleared stack counts as zero until a number is typed', () => {
  const cleared: Player = { id: 'a', name: 'Alex', buyIns: 2, left: null }
  assert.equal(playerNet(cleared, 100), -200)
  assert.equal(summarize({ oneBuyIn: 100, players: [cleared] }).totalLeft, 0)
})

test('a player id can be made without a secure context', () => {
  const source = globalThis.crypto
  const randomUUID = source.randomUUID
  Object.defineProperty(source, 'randomUUID', { value: undefined, configurable: true })
  try {
    assert.match(newId(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  } finally {
    Object.defineProperty(source, 'randomUUID', { value: randomUUID, configurable: true })
  }
})

test('one game merges the same name and skips blanks', () => {
  const session: Session = {
    oneBuyIn: 200,
    players: [
      { id: '1', name: 'Alex', buyIns: 1, left: 300 },
      { id: '2', name: ' alex ', buyIns: 2, left: 100 },
      { id: '3', name: '  ', buyIns: 1, left: 200 },
    ],
  }
  const game = recordGame(session, '2026-11-04T06:00:00.000Z', 'g1', ' Friday ')
  assert.deepEqual(game, {
    id: 'g1',
    title: 'Friday',
    playedAt: '2026-11-04T06:00:00.000Z',
    oneBuyIn: 200,
    players: [{ name: 'Alex', buyIns: 3, left: 400, net: -200 }],
  })
})

test('a table with no names is not a game', () => {
  const session: Session = { oneBuyIn: 200, players: [{ id: '1', name: ' ', buyIns: 1, left: 200 }] }
  assert.equal(recordGame(session, '2026-11-04T06:00:00.000Z', 'g1'), null)
})

test('standings add the same player across games', () => {
  const first = recordGame(
    { oneBuyIn: 100, players: [{ id: '1', name: 'Alex', buyIns: 1, left: 200 }] },
    '2026-11-04T06:00:00.000Z',
    'g1',
  )
  const second = recordGame(
    { oneBuyIn: 100, players: [{ id: '2', name: 'alex', buyIns: 2, left: 50 }] },
    '2026-11-04T08:00:00.000Z',
    'g2',
  )
  assert.ok(first)
  assert.ok(second)
  assert.deepEqual(standings([first, second]), [{ name: 'Alex', net: -50 }])
})

test('signed amounts use a minus glyph', () => {
  assert.equal(formatSigned(-1500), '−1,500')
  assert.equal(formatSigned(40), '+40')
  assert.equal(formatSigned(0), '0')
})
