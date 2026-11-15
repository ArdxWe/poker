import { getStore } from '@netlify/blobs'
import { handleClubRequest, type ClubStore } from '../../src/server/ledger.ts'

export default async (request: Request) => {
  if (request.method !== 'POST') {
    return Response.json({ ok: false, reason: 'failed' }, { status: 405 })
  }
  const blobs = getStore('clubs')
  const store: ClubStore = {
    async get(key) {
      return (await blobs.get(key)) ?? null
    },
    async setNew(key, value) {
      const result = await blobs.set(key, value, { onlyIfNew: true })
      return result.modified
    },
    async set(key, value) {
      await blobs.set(key, value)
    },
    async delete(key) {
      await blobs.delete(key)
    },
    async list(prefix) {
      const keys: string[] = []
      for await (const page of blobs.list({ prefix, paginate: true })) {
        for (const blob of page.blobs) keys.push(blob.key)
      }
      return keys
    },
  }
  try {
    const result = await handleClubRequest(store, await request.json())
    return Response.json(result)
  } catch {
    return Response.json({ ok: false, reason: 'failed' }, { status: 500 })
  }
}
