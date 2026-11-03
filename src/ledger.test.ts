import assert from 'node:assert/strict'
import test from 'node:test'
import { formatSigned, playerNet, summarize, type Player, type Session } from './ledger.ts'

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

test('signed amounts use a minus glyph', () => {
  assert.equal(formatSigned(-1500), '−1,500')
  assert.equal(formatSigned(40), '+40')
  assert.equal(formatSigned(0), '0')
})
