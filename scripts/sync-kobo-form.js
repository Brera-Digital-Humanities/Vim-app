#!/usr/bin/env node
/**
 * sync-kobo-form.js — Regenerate src/data.js from the real Kobo form.
 *
 * Fetches the asset content from KoboToolbox and maps survey + choices into
 * VIM's PAGES / CHOICES / RELEVANT structures. Credentials are read from .env;
 * the written data.js keeps only the public Kobo UID placeholder.
 *
 * Usage: npm run sync   (or: node scripts/sync-kobo-form.js)
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'src', 'data.js');

// ── Load .env (token, uid, base) ─────────────────────────────────────────────
function loadEnv() {
  const f = path.join(ROOT, '.env');
  if (!fs.existsSync(f)) { console.error('ERROR: .env missing. cp .env.example .env'); process.exit(1); }
  const env = {};
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

// Field types VIM knows how to render. Metadata rows are skipped.
const FIELD_TYPES = new Set(['text','integer','decimal','date','time','dateTime',
  'select_one','select_multiple','audio','image','video','file','note','geopoint']);

async function main() {
  const env = loadEnv();
  const TOKEN = env.VIM_KOBO_TOKEN, UID = env.VIM_KOBO_UID, BASE = env.VIM_KOBO_BASE;
  if (!TOKEN || !UID || !BASE) { console.error('ERROR: VIM_KOBO_TOKEN/UID/BASE missing in .env'); process.exit(1); }

  const hdr = { headers: { Authorization: `Token ${TOKEN}` } };
  console.log('▸ Fetching form from Kobo…');
  const assetRes = await fetch(`${BASE}/api/v2/assets/${UID}/?format=json`, hdr);
  if (!assetRes.ok) { console.error(`ERROR: Kobo returned HTTP ${assetRes.status}`); process.exit(1); }
  const asset = await assetRes.json();

  // Prefer the DEPLOYED version (what people actually fill in) over the draft
  // content. They can differ if there are unsaved/undeployed edits on Kobo.
  let content = asset.content;
  const dvid = asset.deployed_version_id;
  if (dvid && dvid !== asset.version_id) {
    console.log(`▸ Using deployed version ${dvid} (draft differs)`);
    const vRes = await fetch(`${BASE}/api/v2/assets/${UID}/versions/${dvid}/?format=json`, hdr);
    if (vRes.ok) {
      const v = await vRes.json();
      content = v.content || v;
    } else {
      console.warn(`  (could not fetch deployed version, HTTP ${vRes.status} — using draft content)`);
    }
  }
  if (!content || !content.survey) { console.error('ERROR: form has no survey rows'); process.exit(1); }

  // translations → language indexes (robust to order)
  const tr = content.translations || ['Italian (it)'];
  const idx = {
    it: tr.findIndex(t => /italian|\(it\)/i.test(t)),
    en: tr.findIndex(t => /english|\(en\)/i.test(t)),
    ar: tr.findIndex(t => /arabic|\(ar\)/i.test(t)),
  };
  // pick(label, lang): label may be array (multilingual) or string
  const pick = (val, lang) => {
    if (val == null) return '';
    if (Array.isArray(val)) return (idx[lang] >= 0 ? val[idx[lang]] : val[0]) || '';
    return String(val);
  };

  // ── Build PAGES + RELEVANT from survey ─────────────────────────────────────
  const PAGES = [];
  const RELEVANT = {};
  let cur = null;
  for (const row of content.survey) {
    const t = row.type;
    if (t === 'begin_group') {
      cur = { name: row.name, label_it: pick(row.label,'it'), label_en: pick(row.label,'en'),
              label_ar: pick(row.label,'ar'), fields: [] };
      PAGES.push(cur);
      continue;
    }
    if (t === 'end_group') { cur = null; continue; }
    if (!FIELD_TYPES.has(t)) continue;          // skip start/end/deviceid/calculate…
    if (!cur) continue;                         // field outside any group → ignore

    // select_one/multiple carry the choice list name
    let type = t;
    if ((t === 'select_one' || t === 'select_multiple') && row.select_from_list_name) {
      type = `${t} ${row.select_from_list_name}`;
    }
    const field = {
      type,
      name: row.name,
      label_it: pick(row.label,'it'),
      label_en: pick(row.label,'en'),
      label_ar: pick(row.label,'ar'),
      hint_it: pick(row.hint,'it'),
      hint_en: pick(row.hint,'en'),
      hint_ar: pick(row.hint,'ar'),
      required: row.required ? 'yes' : '',
      relevant: row.relevant || '',
      choice_filter: row.choice_filter || '',   // cascading select (e.g. cat=${file_occasion_cat})
    };
    cur.fields.push(field);
    if (row.relevant) RELEVANT[row.name] = row.relevant;
  }

  // ── Build CHOICES from choices ─────────────────────────────────────────────
  // Besides name + labels, keep any extra scalar columns (e.g. `cat`) used by
  // cascading-select choice_filters.
  const CH_SKIP = new Set(['name', 'label', 'list_name', '$kuid', '$autovalue', 'wikidata_q']);
  const CHOICES = {};
  for (const ch of (content.choices || [])) {
    const list = ch.list_name;
    if (!list) continue;
    const o = {
      name: ch.name || ch.$autovalue,
      it: pick(ch.label,'it'), en: pick(ch.label,'en'), ar: pick(ch.label,'ar'),
    };
    for (const k in ch) if (!CH_SKIP.has(k) && typeof ch[k] !== 'object') o[k] = ch[k];
    (CHOICES[list] = CHOICES[list] || []).push(o);
  }

  // ── Write data.js (credentials stay as placeholders) ───────────────────────
  const header = `/**
 * VIM — data.js  (GENERATED by scripts/sync-kobo-form.js from the Kobo form)
 *
 * PAGES + CHOICES + RELEVANT are the real form definition fetched from
 * KoboToolbox. Do not edit by hand — re-run \`npm run sync\` after changing
 * the form on Kobo.
 *
 * SECURITY: only the public Kobo UID is injected at build time. The Kobo API
 * token stays server-side in WinterCMS.
 */

const UID   = '__VIM_KOBO_UID__';

const CHOICES = ${JSON.stringify(CHOICES)};

const PAGES = ${JSON.stringify(PAGES)};

const RELEVANT = ${JSON.stringify(RELEVANT)};
`;
  fs.writeFileSync(OUT, header);

  const nFields = PAGES.reduce((s,p) => s + p.fields.length, 0);
  console.log(`▸ Form: "${asset.name}"  (${tr.join(', ')})`);
  console.log(`▸ Written ${path.relative(ROOT, OUT)}`);
  console.log(`    PAGES:    ${PAGES.length} sections, ${nFields} fields`);
  console.log(`    CHOICES:  ${Object.keys(CHOICES).length} lists`);
  console.log(`    RELEVANT: ${Object.keys(RELEVANT).length} conditional fields`);
  console.log('✓ Sync done. Run `npm run build` to regenerate the app.');
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
