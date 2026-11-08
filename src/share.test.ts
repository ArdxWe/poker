import assert from 'node:assert/strict'
import test from 'node:test'
import type { Game } from './ledger.ts'
import { buildShareUrl, decodeGameShare, encodeGameShare, readShareTokenFromLocation } from './share.ts'

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
})
