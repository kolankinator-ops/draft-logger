/**
 * Offline-first sync layer.
 *
 * Local IndexedDB is the source of truth for reads.
 * Supabase is synced in the background.
 * When offline, writes queue and flush when reconnected.
 */

import { supabase, fetchEntries, upsertEntries, fetchSettings, upsertSettings } from './supabase.js'

const DB_NAME    = 'DraftLoggerV2'
const DB_VERSION = 1
let _db = null

// ── IndexedDB setup ───────────────────────────────────────────

export function openLocalDB() {
  if (_db) return Promise.resolve(_db)
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = e => {
      const db = e.target.result
      if (!db.objectStoreNames.contains('entries'))
        db.createObjectStore('entries', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('bulk'))
        db.createObjectStore('bulk', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('settings'))
        db.createObjectStore('settings', { keyPath: 'key' })
      if (!db.objectStoreNames.contains('syncQueue'))
        db.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true })
    }
    req.onsuccess = e => { _db = e.target.result; res(_db) }
    req.onerror   = () => rej(new Error('Failed to open local DB'))
  })
}

async function localGet(store, key) {
  const db = await openLocalDB()
  return new Promise((res, rej) => {
    const req = db.transaction(store, 'readonly').objectStore(store).get(key)
    req.onsuccess = () => res(req.result)
    req.onerror   = () => rej(req.error)
  })
}

async function localGetAll(store) {
  const db = await openLocalDB()
  return new Promise((res, rej) => {
    const req = db.transaction(store, 'readonly').objectStore(store).getAll()
    req.onsuccess = () => res(req.result || [])
    req.onerror   = () => rej(req.error)
  })
}

async function localPut(store, value) {
  const db = await openLocalDB()
  return new Promise((res, rej) => {
    const req = db.transaction(store, 'readwrite').objectStore(store).put(value)
    req.onsuccess = () => res()
    req.onerror   = () => rej(req.error)
  })
}

async function localPutMany(store, values) {
  const db = await openLocalDB()
  return new Promise((res, rej) => {
    const tx = db.transaction(store, 'readwrite')
    const s  = tx.objectStore(store)
    values.forEach(v => s.put(v))
    tx.oncomplete = res
    tx.onerror    = () => rej(tx.error)
  })
}

async function localDelete(store, key) {
  const db = await openLocalDB()
  return new Promise((res, rej) => {
    const req = db.transaction(store, 'readwrite').objectStore(store).delete(key)
    req.onsuccess = () => res()
    req.onerror   = () => rej(req.error)
  })
}

// ── Entries ───────────────────────────────────────────────────

export async function loadEntries() {
  return localGetAll('entries')
}

export async function loadBulkEntries() {
  return localGetAll('bulk')
}

export async function loadAllGameData() {
  const [personal, bulk] = await Promise.all([loadEntries(), loadBulkEntries()])
  return [...personal, ...bulk]
}

export async function saveEntry(entry) {
  if (entry.isBulkImport) {
    await localPut('bulk', entry)
  } else {
    await localPut('entries', entry)
  }
  // Queue for Supabase sync
  queueSync('upsert', 'entries', entry)
}

export async function saveEntries(entries) {
  const personal = entries.filter(e => !e.isBulkImport)
  const bulk     = entries.filter(e =>  e.isBulkImport)
  if (personal.length) await localPutMany('entries', personal)
  if (bulk.length)     await localPutMany('bulk', bulk)
  queueSync('upsert', 'entries', entries)
}

export async function deleteEntry(id) {
  await localDelete('entries', id)
  queueSync('delete', 'entries', { id })
}

// ── Settings ──────────────────────────────────────────────────

export async function loadSettings() {
  const row = await localGet('settings', 'main')
  return row ? row.value : {}
}

export async function saveSettings(settings) {
  await localPut('settings', { key: 'main', value: settings })
  queueSync('upsert', 'settings', settings)
}

// Individual setting helpers used throughout the app
export async function loadBankroll()       { const s = await loadSettings(); return s.bankroll       || {} }
export async function loadFactorWeights()  { const s = await loadSettings(); return s.factorWeights  || {} }
export async function loadPlattParams()    { const s = await loadSettings(); return s.plattParams     || null }
export async function loadCustomStreams()  { const s = await loadSettings(); return s.customStreams   || {} }
export async function loadTeamAliases()   { const s = await loadSettings(); return s.teamAliases     || {} }
export async function loadPlayerReviews() { const s = await loadSettings(); return s.playerReviews   || {} }
export async function loadTierConfig()    { const s = await loadSettings(); return s.tierConfig      || {} }
export async function loadStandings()     { const s = await loadSettings(); return s.manualStandings || [] }
export async function loadTodayPlan()     { const s = await loadSettings(); return s.todayPlan       || { games: [] } }
export async function loadRosters()       { const s = await loadSettings(); return s.rosters         || [] }

export async function patchSettings(patch) {
  const current = await loadSettings()
  const merged  = { ...current, ...patch }
  await saveSettings(merged)
  return merged
}

// ── Sync queue ────────────────────────────────────────────────

function queueSync(op, table, data) {
  // Fire-and-forget — errors are caught and re-queued
  openLocalDB().then(db => {
    db.transaction('syncQueue', 'readwrite')
      .objectStore('syncQueue')
      .add({ op, table, data, queuedAt: Date.now() })
  })
  triggerFlush()
}

let _flushTimer = null
function triggerFlush() {
  if (_flushTimer) return
  _flushTimer = setTimeout(async () => {
    _flushTimer = null
    await flushSyncQueue()
  }, 1500)
}

let _flushing = false
export async function flushSyncQueue() {
  if (_flushing || !navigator.onLine) return
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  _flushing = true
  try {
    const db = await openLocalDB()
    const items = await new Promise((res, rej) => {
      const req = db.transaction('syncQueue', 'readonly').objectStore('syncQueue').getAll()
      req.onsuccess = () => res(req.result || [])
      req.onerror   = () => rej(req.error)
    })
    if (!items.length) return

    // Group by table + op for batch efficiency
    const entryUpserts = items.filter(i => i.table === 'entries' && i.op === 'upsert').flatMap(i => Array.isArray(i.data) ? i.data : [i.data])
    const entryDeletes = items.filter(i => i.table === 'entries' && i.op === 'delete').map(i => i.data.id)
    const settingPatch = items.filter(i => i.table === 'settings').at(-1)?.data

    if (entryUpserts.length) await upsertEntries(user.id, entryUpserts)
    if (entryDeletes.length) {
      for (const id of entryDeletes) {
        await supabase.from('entries').delete().eq('id', id).eq('user_id', user.id)
      }
    }
    if (settingPatch) await upsertSettings(user.id, { ...settingPatch })

    // Clear successfully synced items
    const tx = db.transaction('syncQueue', 'readwrite')
    tx.objectStore('syncQueue').clear()
    await new Promise(res => { tx.oncomplete = res })
  } catch(e) {
    console.warn('Sync flush failed:', e)
  } finally {
    _flushing = false
  }
}

// ── Full sync from Supabase ───────────────────────────────────

export async function pullFromSupabase() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, reason: 'Not signed in' }

  try {
    const [remoteEntries, remoteSettings] = await Promise.all([
      fetchEntries(user.id),
      fetchSettings(user.id)
    ])

    // Merge entries: prefer entry with more data (actualWinner wins)
    const localEntries = await loadEntries()
    const localById    = new Map(localEntries.map(e => [e.id, e]))

    const merged = remoteEntries.map(remote => {
      const local = localById.get(remote.id)
      if (!local) return remote
      const localBetter =
        (local.actualWinner && !remote.actualWinner) ||
        (local.watched != null && remote.watched == null) ||
        (local.predWinner && !remote.predWinner)
      return localBetter ? local : remote
    })
    // Keep local-only entries too
    remoteEntries.forEach(r => localById.delete(r.id))
    localById.forEach(e => merged.push(e))

    await localPutMany('entries', merged)

    // Settings: just take remote (source of truth)
    if (remoteSettings.bankroll !== undefined || remoteSettings.factor_weights !== undefined) {
      const normalized = {
        bankroll:        remoteSettings.bankroll        || {},
        factorWeights:   remoteSettings.factor_weights  || {},
        plattParams:     remoteSettings.platt_params    || null,
        customStreams:   remoteSettings.custom_streams  || {},
        teamAliases:     remoteSettings.team_aliases    || {},
        playerReviews:   remoteSettings.player_reviews  || {},
        tierConfig:      remoteSettings.tier_config     || {},
        manualStandings: remoteSettings.manual_standings|| [],
        manualSchedule:  remoteSettings.manual_schedule || [],
        todayPlan:       remoteSettings.today_plan      || { games: [] },
        rosters:         remoteSettings.rosters         || []
      }
      await localPut('settings', { key: 'main', value: normalized })
    }

    return { ok: true, count: merged.length }
  } catch(e) {
    console.error('Pull from Supabase failed:', e)
    return { ok: false, reason: e.message }
  }
}

// Listen for online event and flush pending changes
window.addEventListener('online', () => {
  console.log('Back online — flushing sync queue')
  flushSyncQueue()
})
