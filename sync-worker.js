/**
 * Draft Logger — sync server (Cloudflare Worker)
 * ------------------------------------------------------------------
 * Bindings required:
 *   KV namespace binding : SYNC_KV
 *   Secret / variable    : SYNC_CODE   (any long random string; the same
 *                                       string is pasted into the app on
 *                                       each of your devices)
 *
 * Protocol: one endpoint, POST /sync
 *   body: {
 *     scope        : "state" | "bulk",
 *     since        : <int>  server sequence the client last saw,
 *     records      : [ {id, updatedAt, ...} ],   // client changes to merge
 *     tombstones   : { id: deletedAtMs },        // client deletions
 *     settings     : { key: value },             // changed settings only
 *     settingsMeta : { key: updatedAtMs },
 *     full         : <bool> ask for the entire document back
 *   }
 *
 * The server merges by record id, newest updatedAt wins, and replies with
 * everything the client has not seen yet. Because each client always keeps
 * its own full copy and re-sends anything the server does not acknowledge,
 * a dropped or overlapping write self-heals on the next round trip.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Sync-Code",
  "Access-Control-Max-Age": "86400",
};

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });

const EMPTY = () => ({
  seq: 0,
  records: [],
  tombstones: {},
  settings: {},
  settingsMeta: {},
});

async function readDoc(env, key) {
  const raw = await env.SYNC_KV.get(key);
  if (!raw) return EMPTY();
  try {
    const d = JSON.parse(raw);
    return {
      seq: d.seq || 0,
      records: Array.isArray(d.records) ? d.records : [],
      tombstones: d.tombstones || {},
      settings: d.settings || {},
      settingsMeta: d.settingsMeta || {},
    };
  } catch (e) {
    return EMPTY();
  }
}

function pruneTombstones(tombs, maxAgeDays = 180) {
  const cutoff = Date.now() - maxAgeDays * 86400000;
  const out = {};
  for (const [id, ts] of Object.entries(tombs)) if (ts > cutoff) out[id] = ts;
  return out;
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });

    const url = new URL(request.url);
    if (url.pathname === "/" || url.pathname === "/health") {
      return json({ ok: true, service: "draft-logger-sync" });
    }
    if (request.method !== "POST" || url.pathname !== "/sync") {
      return json({ error: "Not found" }, 404);
    }
    if (!env.SYNC_CODE) {
      return json({ error: "Worker is missing the SYNC_CODE variable." }, 500);
    }
    if (request.headers.get("X-Sync-Code") !== env.SYNC_CODE) {
      return json({ error: "Bad sync code" }, 401);
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ error: "Bad JSON body" }, 400);
    }

    const scope = body.scope === "bulk" ? "bulk" : "state";
    const key = "doc:" + scope;
    const since = Number(body.since) || 0;
    const wantFull = !!body.full;

    const doc = await readDoc(env, key);
    let dirty = false;
    const nextSeq = doc.seq + 1;

    // ---- merge incoming records (newest updatedAt wins) ----
    const byId = new Map(doc.records.map((r) => [r.id, r]));
    for (const r of body.records || []) {
      if (!r || !r.id) continue;
      const cur = byId.get(r.id);
      if (!cur || (r.updatedAt || 0) > (cur.updatedAt || 0)) {
        byId.set(r.id, { ...r, _s: nextSeq });
        dirty = true;
      }
    }

    // ---- merge incoming tombstones ----
    const tombs = { ...doc.tombstones };
    for (const [id, ts] of Object.entries(body.tombstones || {})) {
      const t = Number(ts) || 0;
      if (!tombs[id] || t > tombs[id]) {
        tombs[id] = t;
        dirty = true;
      }
    }
    // a delete only wins over a record that has not been edited since
    for (const [id, ts] of Object.entries(tombs)) {
      const r = byId.get(id);
      if (r && (r.updatedAt || 0) <= ts) {
        byId.delete(id);
        dirty = true;
      }
    }

    // ---- merge settings, per key, newest wins ----
    const settings = { ...doc.settings };
    const settingsMeta = { ...doc.settingsMeta };
    for (const [k, v] of Object.entries(body.settings || {})) {
      const at = Number((body.settingsMeta || {})[k]) || 0;
      const cur = settingsMeta[k];
      if (!cur || at > cur.at) {
        settings[k] = v;
        settingsMeta[k] = { at, s: nextSeq };
        dirty = true;
      }
    }

    if (dirty) {
      const pruned = pruneTombstones(tombs);
      await env.SYNC_KV.put(
        key,
        JSON.stringify({
          seq: nextSeq,
          records: [...byId.values()],
          tombstones: pruned,
          settings,
          settingsMeta,
        })
      );
      doc.seq = nextSeq;
    }

    // ---- reply with whatever this client has not seen ----
    const serverSeq = doc.seq;
    const all = [...byId.values()];
    const outRecords = wantFull ? all : all.filter((r) => (r._s || 0) > since);

    const outSettings = {};
    const outSettingsMeta = {};
    for (const [k, meta] of Object.entries(settingsMeta)) {
      if (wantFull || (meta.s || 0) > since) {
        outSettings[k] = settings[k];
        outSettingsMeta[k] = meta.at;
      }
    }

    return json({
      seq: serverSeq,
      records: outRecords,
      tombstones: tombs,
      settings: outSettings,
      settingsMeta: outSettingsMeta,
      total: all.length,
    });
  },
};
