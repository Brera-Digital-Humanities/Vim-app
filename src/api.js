/**
 * VIM — api.js
 * All network calls. Submits completed forms through the VIM backend.
 *
 * Depends on: data.js (UID, PAGES), auth.js (AUTH_API_URL/apiAccessToken),
 * and the navigation bundle (showSuccess, showError, tr, answers, outbox).
 *
 * The backend keeps the KoboToolbox token server-side and forwards the OpenRosa
 * multipart payload to Kobo.
 */


/**
 * buildSubmissionXml(ans, mf, instanceId) — Build the OpenRosa/XForm XML for a
 * submission. The Kobo form nests fields inside groups (begin_group), so the
 * instance must mirror that: <data><pag_nomi><name_english>…</pag_nomi>…. A flat
 * structure lands in "extra" columns and leaves the form's real columns empty.
 * Each PAGES section is a group; calculate fields are placed by their xpath
 * (paese_group at the top level, file_name inside sez_materiali). Media fields
 * carry only the filename (the binary is sent as a separate multipart part).
 * Built once at completion and stored, so a queued submission is immune to
 * later changes of the form schema.
 */
function buildSubmissionXml(ans, mf, instanceId) {
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // One field element, or '' when the field is empty.
  const fieldEl = (name) => {
    const v = ans[name];
    if (v === undefined || v === null || v === '' ||
        (Array.isArray(v) && v.length === 0)) return '';
    if (mf[name]) return `<${name}>${esc(mf[name].name)}</${name}>`;   // filename only
    return `<${name}>${esc(Array.isArray(v) ? v.join(' ') : v)}</${name}>`;
  };

  // Group calculate fields by their containing group (from xpath "group/field").
  const calcByGroup = {};   // groupName → [fieldName]
  const topCalc = [];       // calculate fields at the instance root (e.g. paese_group)
  if (typeof CALCULATIONS !== 'undefined') {
    CALCULATIONS.forEach(([name, , xpath]) => {
      const segs = (xpath || name).split('/');
      if (segs.length > 1) (calcByGroup[segs[0]] = calcByGroup[segs[0]] || []).push(name);
      else topCalc.push(name);
    });
  }

  const xmlParts = [`<?xml version="1.0" ?><data id="${UID}">`];
  // Root-level calculate fields first (matches form order: paese_group precedes groups)
  topCalc.forEach(n => { const el = fieldEl(n); if (el) xmlParts.push(el); });
  // Each section → a group element wrapping its (non-empty) fields + any calc in it
  PAGES.forEach(pg => {
    let inner = '';
    pg.fields.forEach(q => { inner += fieldEl(q.name); });
    (calcByGroup[pg.name] || []).forEach(n => { inner += fieldEl(n); });
    if (inner) xmlParts.push(`<${pg.name}>${inner}</${pg.name}>`);
  });
  // OpenRosa meta: stable instanceID → server-side dedup of re-sent forms
  if (instanceId) xmlParts.push(`<meta><instanceID>${instanceId}</instanceID></meta>`);
  xmlParts.push('</data>');
  return xmlParts.join('');
}

/**
 * doSubmit(xml, mf) — Submit a completed form (prebuilt OpenRosa XML + media).
 *
 * @param {string} xml - the OpenRosa XML (from buildSubmissionXml)
 * @param {Object} mf  - fieldName → File object
 * @returns {Promise<{ok: boolean, permanent: boolean, status?: number, message?: string}>}
 *          permanent=true when a retry can't help (e.g. file too large / bad request).
 */
const SUBMIT_TIMEOUT_MS = 120000;   // abort a stalled upload so the queue isn't blocked

function _shortText(value, max) {
  const text = String(value || '')
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? text.slice(0, max) + '...' : text;
}

function _flattenError(value) {
  if (!value) return '';
  if (Array.isArray(value)) return value.map(_flattenError).filter(Boolean).join(' ');
  if (typeof value === 'object') return Object.values(value).map(_flattenError).filter(Boolean).join(' ');
  return String(value);
}

async function _readSubmitError(response) {
  const raw = await response.text().catch(() => '');
  let message = response.statusText || 'Submit failed';

  if (raw) {
    try {
      const data = JSON.parse(raw);
      message = data.error || data.message || _flattenError(data.errors) || message;
      if (data.kobo_response) {
        message += ' Kobo: ' + _flattenError(data.kobo_response);
      }
    } catch (error) {
      message = raw;
    }
  }

  return _shortText(message, 1200);
}

async function doSubmit(xml, mf) {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), SUBMIT_TIMEOUT_MS);
  try {
    // ── Build multipart FormData ──────────────────────────────────────────
    const formData = new FormData();

    // The XML is the main part of the submission
    formData.append(
      'xml_submission_file',
      new Blob([xml], { type: 'text/xml' }),
      'submission.xml'
    );

    // Media attachments: each file keyed by its field name
    Object.entries(mf).forEach(([fieldName, file]) => {
      formData.append(fieldName, file, file.name);
    });

    // ── API call ──────────────────────────────────────────────────────────
    // POST /api/v1/kobo/submissions (VIM backend). The backend forwards to
    // KoboToolbox /submission with the server-side Kobo API token.
    const response = await fetch(`${AUTH_API_URL}/kobo/submissions`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Authorization': `${apiTokenType || 'bearer'} ${apiAccessToken}`,
      },
      body: formData,
      signal: ctrl.signal,
    });
    clearTimeout(timer);

    if (response.ok || response.status === 201) return { ok: true, permanent: false, status: response.status };
    // 4xx from Kobo usually won't succeed on retry. Auth-related 401/403 are
    // not marked permanent so a re-login can flush the outbox later.
    const s = response.status;
    const permanent = s >= 400 && s < 500 && s !== 401 && s !== 403 && s !== 408 && s !== 429;
    const message = await _readSubmitError(response);
    console.error('[VIM API] submit failed:', s, message);
    return { ok: false, permanent, status: s, message };

  } catch (error) {
    // Network error, CORS, or timeout (abort) → transient, retry later.
    clearTimeout(timer);
    const message = error && (error.message || error.name) ? (error.message || error.name) : 'Network error';
    console.error('[VIM API] submit error:', message);
    return { ok: false, permanent: false, status: 0, message };
  }
}
