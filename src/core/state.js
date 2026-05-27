// VIM — application state (globals)


let pageIdx        = 0;      // Current section index (0-based)
let answers        = {};     // fieldName → answer value
let mediaFiles     = {};     // fieldName → File object
let outbox         = [];     // Completed forms to send
                             // Shape: [{id, answers, mediaFiles, savedAt, label}]  (id = instanceID)
let sentForms      = [];     // Already-sent forms (metadata only)
let drafts         = [];     // Saved drafts
                             // Shape: [{id, answers, mediaFiles, pageIdx, fieldIdx, savedAt, label}]
                             // id = instanceID; window._editingDraft = index of the draft being edited (null = new form)
let langReturn     = 'home'; // Where to return after the language screen: 'home' | 'form'
let langReturnField= 0;      // window._fieldIdx to restore when returning to the form
let testerName     = '';     // Logged username/display name
let apiUsername    = '';     // Username used for API login
let apiAccessToken = '';     // JWT access token returned by the backend
let apiTokenType   = 'bearer';
let apiUser        = null;   // Backend user payload
let loggedIn       = false;  // True after API login (persisted)
let langChosen     = false;  // True once a language was picked (persisted):
                             // if set, the language screen is skipped at startup

