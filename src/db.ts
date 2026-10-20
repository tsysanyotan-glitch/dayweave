import { openDB, type DBSchema } from 'idb'
import type { LocalRecord } from './model'

interface DayDB extends DBSchema {
  records: { key: [string, string]; value: LocalRecord; indexes: { scope: string } }
}
const database = openDB<DayDB>('dayweave-v1', 1, {
  upgrade(db) { const store = db.createObjectStore('records', { keyPath: ['scope', 'task.id'] }); store.createIndex('scope', 'scope') },
})
export async function loadRecords(scope: string) { return (await database).getAllFromIndex('records', 'scope', scope) }
export async function saveRecords(records: LocalRecord[]) {
  const db = await database
  const tx = db.transaction('records', 'readwrite')
  await Promise.all([...records.map(record => tx.store.put(record)), tx.done])
}
