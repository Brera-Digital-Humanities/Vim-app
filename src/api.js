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
 * submission: <data id="{uid}"><field>value</field>…<meta><instanceID>…</data>.
 * Media fields carry only the filename (the binary is sent as a separate part).
 * Built once at completion and stored, so a queued submission is immune to
 * later changes of the form schema.
 */
function buildSubmissionXml(ans, mf, instanceId) {
  const xmlParts = [`<?xml version="1.0" ?><data id="${UID}">`];
  PAGES.forEach(pg => {
    pg.fields.forEach(q => {
      const v = ans[q.name];
      if (v === undefined || v === null || v === '' ||
          (Array.isArray(v) && v.length === 0)) return;   // skip empty
      const val = Array.isArray(v) ? v.join(' ') : v;
      if (mf[q.name]) {
        xmlParts.push(`<${q.name}>${mf[q.name].name}</${q.name}>`);   // filename only
      } else {
        const escaped = String(val).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        xmlParts.push(`<${q.name}>${escaped}</${q.name}>`);
      }
    });
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
