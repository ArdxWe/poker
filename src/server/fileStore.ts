import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { ClubStore } from './ledger.ts'

export function createFileClubStore(file: string): ClubStore {
  let chain = Promise.resolve()

  function locked<T>(run: (data: Map<string, string>) => Promise<T>): Promise<T> {
    const next = chain.then(async () => {
      const data = new Map<string, string>()
      try {
        const parsed: unknown = JSON.parse(await readFile(file, 'utf8'))
        if (parsed && typeof parsed === 'object') {
          for (const [key, value] of Object.entries(parsed)) {
            if (typeof value === 'string') data.set(key, value)
          }
        }
      } catch {
        // A missing file is an empty store.
      }
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
