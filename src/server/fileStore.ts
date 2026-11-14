import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { ClubStore } from './ledger.ts'

function missingFile(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}

async function readStore(file: string): Promise<Map<string, string>> {
  let raw: string
  try {
    raw = await readFile(file, 'utf8')
  } catch (error) {
    // A missing file is an empty store. A bad read must not be rewritten as {}.
    if (missingFile(error)) return new Map()
    throw error
  }
  const parsed: unknown = JSON.parse(raw)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Club store is unreadable')
  }
  const data = new Map<string, string>()
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value !== 'string') throw new Error('Club store is unreadable')
    data.set(key, value)
  }
  return data
}

export function createFileClubStore(file: string): ClubStore {
  let chain = Promise.resolve()

  function locked<T>(run: (data: Map<string, string>) => Promise<T>): Promise<T> {
    const next = chain.then(async () => {
      const data = await readStore(file)
      const result = await run(data)
      await mkdir(dirname(file), { recursive: true })
      const temp = `${file}.tmp`
      const json = JSON.stringify(Object.fromEntries(data))
      await writeFile(temp, json)
      await rename(temp, file)
      return result
    })
    chain = next.then(
      () => undefined,
      () => undefined,
    )
    return next
  }

  return {
    get(key) {
      return locked(async (data) => data.get(key) ?? null)
    },
    setNew(key, value) {
      return locked(async (data) => {
        if (data.has(key)) return false
        data.set(key, value)
        return true
      })
    },
    set(key, value) {
      return locked(async (data) => {
        data.set(key, value)
      })
    },
    delete(key) {
      return locked(async (data) => {
        data.delete(key)
      })
    },
    list(prefix) {
      return locked(async (data) => [...data.keys()].filter((key) => key.startsWith(prefix)))
    },
  }
}
