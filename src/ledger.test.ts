import assert from 'node:assert/strict'
import test from 'node:test'
import { chipsLeft, formatSigned, newId, playerNet, summarize, type Player, type Session } from './ledger.ts'

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

test('signed amounts use a minus glyph', () => {
  assert.equal(formatSigned(-1500), '−1,500')
  assert.equal(formatSigned(40), '+40')
  assert.equal(formatSigned(0), '0')
})
