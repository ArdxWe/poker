import assert from 'node:assert/strict'
import test from 'node:test'
import {
  chipsLeft,
  formatSigned,
  newId,
  playerNet,
  playersByNet,
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

test('an empty left is not a net', () => {
  const open: Player = { id: 'a', name: 'Alex', buyIns: 2, left: null }
  assert.equal(playerNet(open, 100), null)
  assert.equal(playerNet({ ...open, left: 0 }, 100), -200)
})

test('an empty left is left out of the table result', () => {
  const open: Player = { id: 'a', name: 'Alex', buyIns: 2, left: null }
  const counted: Player = { id: 's', name: 'Sam', buyIns: 1, left: 350 }
  assert.deepEqual(summarize({ oneBuyIn: 200, players: [open, counted] }), {
    totalBuyIns: 3,
    totalIn: 600,
    totalLeft: 350,
    offBy: 150,
  })
})

test('empty stacks do not count as a loss', () => {
  const session: Session = {
    oneBuyIn: 200,
    players: [
      { id: 'a', name: 'Alex', buyIns: 1, left: null },
      { id: 's', name: 'Sam', buyIns: 1, left: null },
    ],
  }
  assert.deepEqual(summarize(session), {
    totalBuyIns: 2,
    totalIn: 400,
    totalLeft: 0,
    offBy: 0,
  })
})

test('saving skips a player whose left is empty', () => {
  const session: Session = {
    oneBuyIn: 200,
    players: [
      { id: '1', name: 'Alex', buyIns: 2, left: null },
      { id: '2', name: 'Sam', buyIns: 1, left: 500 },
      { id: '3', name: 'alex', buyIns: 1, left: null },
    ],
  }
  const game = recordGame(session, '2026-11-04T06:00:00.000Z', 'g1')
  assert.deepEqual(game, {
    id: 'g1',
    title: '',
    playedAt: '2026-11-04T06:00:00.000Z',
    oneBuyIn: 200,
    players: [{ name: 'Sam', buyIns: 1, left: 500, net: 300 }],
  })
})

test('names with an empty left are not a game', () => {
  const session: Session = { oneBuyIn: 200, players: [{ id: '1', name: 'Alex', buyIns: 1, left: null }] }
  assert.equal(recordGame(session, '2026-11-04T06:00:00.000Z', 'g1'), null)
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
  assert.deepEqual(standings([first, second]), [{ name: 'Alex', net: -50, games: 2 }])
})

test('a saved game lists the biggest winner first', () => {
  assert.deepEqual(
    playersByNet([
      { name: 'Sam', net: -50 },
      { name: 'Alex', net: 200 },
      { name: 'Bea', net: 200 },
      { name: 'Rio', net: 0 },
    ]).map((player) => player.name),
    ['Alex', 'Bea', 'Rio', 'Sam'],
  )
})

test('signed amounts use a minus glyph', () => {
  assert.equal(formatSigned(-1500), '−1,500')
  assert.equal(formatSigned(40), '+40')
  assert.equal(formatSigned(0), '0')
})
