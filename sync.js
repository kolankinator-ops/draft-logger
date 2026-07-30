import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL     = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  },
  realtime: { params: { eventsPerSecond: 10 } }
})

export function getUser() {
  return supabase.auth.getUser()
}

// ── Auth ──────────────────────────────────────────────────────

export async function signInWithEmail(email, password) {
  return supabase.auth.signInWithPassword({ email, password })
}

export async function signUpWithEmail(email, password) {
  return supabase.auth.signUp({ email, password })
}

export async function signInWithMagicLink(email) {
  return supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } })
}

export async function signOut() {
  return supabase.auth.signOut()
}

// ── Entries ───────────────────────────────────────────────────

export async function fetchEntries(userId) {
  const { data, error } = await supabase
    .from('entries')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false })
  if (error) throw error
  return data.map(dbRowToEntry)
}

export async function upsertEntries(userId, entries) {
  if (!entries.length) return
  const rows = entries.map(e => entryToDbRow(userId, e))
  const { error } = await supabase
    .from('entries')
    .upsert(rows, { onConflict: 'id' })
  if (error) throw error
}

export async function deleteEntry(id) {
  const { error } = await supabase.from('entries').delete().eq('id', id)
  if (error) throw error
}

// ── Settings ──────────────────────────────────────────────────

export async function fetchSettings(userId) {
  const { data, error } = await supabase
    .from('settings')
    .select('*')
    .eq('user_id', userId)
    .single()
  if (error && error.code !== 'PGRST116') throw error
  return data || {}
}

export async function upsertSettings(userId, settings) {
  const { error } = await supabase
    .from('settings')
    .upsert({ user_id: userId, ...settings }, { onConflict: 'user_id' })
  if (error) throw error
}

// ── Helpers ───────────────────────────────────────────────────

function entryToDbRow(userId, e) {
  return {
    id:                   e.id,
    user_id:              userId,
    date:                 e.date || null,
    league:               e.league || null,
    event_context:        e.eventContext || null,
    game_number:          e.gameNumber || null,
    blue_team:            e.blueTeam || null,
    red_team:             e.redTeam || null,
    champions:            e.champions || { blue: [], red: [] },
    players:              e.players   || { blue: [], red: [] },
    draft_pref:           e.draftPref ?? null,
    skill_adv:            e.skillAdv || null,
    exec_demand:          e.execDemand || null,
    pred_winner:          e.predWinner || null,
    pred_conf:            e.predConf ?? null,
    notes:                e.notes || null,
    game_note:            e.gameNote || null,
    game_closeness:       e.gameCloseness || null,
    actual_winner:        e.actualWinner || null,
    winner_confidence:    e.winnerConfidence || null,
    watched:              e.watched ?? false,
    is_vod:               e.isVod ?? false,
    is_bulk_import:       e.isBulkImport ?? false,
    is_standalone_bet:    e.isStandaloneBet ?? false,
    source:               e.source || null,
    bet:                  e.bet || null,
    additional_bets:      e.additionalBets || []
  }
}

function dbRowToEntry(row) {
  return {
    id:                row.id,
    date:              row.date,
    league:            row.league,
    eventContext:      row.event_context,
    gameNumber:        row.game_number,
    blueTeam:          row.blue_team,
    redTeam:           row.red_team,
    champions:         row.champions || { blue: [], red: [] },
    players:           row.players   || { blue: [], red: [] },
    draftPref:         row.draft_pref,
    skillAdv:          row.skill_adv,
    execDemand:        row.exec_demand,
    predWinner:        row.pred_winner,
    predConf:          row.pred_conf,
    notes:             row.notes,
    gameNote:          row.game_note,
    gameCloseness:     row.game_closeness,
    actualWinner:      row.actual_winner,
    winnerConfidence:  row.winner_confidence,
    watched:           row.watched,
    isVod:             row.is_vod,
    isBulkImport:      row.is_bulk_import,
    isStandaloneBet:   row.is_standalone_bet,
    source:            row.source,
    bet:               row.bet,
    additionalBets:    row.additional_bets || []
  }
}
