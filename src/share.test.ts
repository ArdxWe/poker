import assert from 'node:assert/strict'
import test from 'node:test'
import type { Game } from './ledger.ts'
import {
  buildClubShareUrl,
  buildShareUrl,
  decodeClubShare,
  decodeGameShare,
  encodeClubShare,
  encodeGameShare,
  readClubTokenFromLocation,
  readShareTokenFromLocation,
} from './share.ts'

const sample: Game = {
  id: 'g1',
  title: 'Friday',
  playedAt: '2026-11-08T12:00:00.000Z',
  oneBuyIn: 200,
  players: [
    { name: 'Alex', buyIns: 2, left: 100, net: -300 },
    { name: 'Sam', buyIns: 1, left: 500, net: 300 },
  ],
}

test('a game round-trips through a share token', () => {
  const token = encodeGameShare(sample)
  assert.equal(decodeGameShare(token)?.title, 'Friday')
  assert.deepEqual(decodeGameShare(token), sample)
})

test('a share url puts the token in the hash', () => {
  const url = buildShareUrl(sample, 'https://example.com', '/')
  assert.match(url, /^https:\/\/example\.com\/#g=/)
  const token = url.split('#g=')[1]
  assert.deepEqual(decodeGameShare(token), sample)
})

test('share tokens are read from the location hash', () => {
  const token = encodeGameShare(sample)
  assert.equal(readShareTokenFromLocation({ hash: `#g=${token}` }), token)
  assert.equal(readShareTokenFromLocation({ hash: '' }), null)
  assert.equal(decodeGameShare('!!!'), null)
  assert.equal(readShareTokenFromLocation({ hash: '#c=club' }), null)
})

test('a club round-trips through a share token', () => {
  const games = [sample, { ...sample, id: 'g2', title: 'Saturday' }]
  const token = encodeClubShare(games)
  assert.deepEqual(decodeClubShare(token), games)
  const url = buildClubShareUrl(games, 'https://example.com', '/')
  assert.ok(url)
  assert.match(url, /^https:\/\/example\.com\/#c=/)
  const clubToken = url.slice(url.indexOf('#c=') + 3)
  assert.deepEqual(decodeClubShare(clubToken), games)
  assert.equal(readClubTokenFromLocation({ hash: `#c=${clubToken}` }), clubToken)
  assert.equal(readShareTokenFromLocation({ hash: `#c=${clubToken}` }), null)
})

test('a club share rejects an empty list and a broken token', () => {
  assert.equal(buildClubShareUrl([], 'https://example.com', '/'), null)
  assert.equal(decodeClubShare(''), null)
  assert.equal(decodeClubShare('!!!'), null)
  assert.equal(decodeClubShare('a'.repeat(60001)), null)
  assert.equal(readClubTokenFromLocation({ hash: '#g=game' }), null)
})
