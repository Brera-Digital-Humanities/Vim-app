// VIM — application state (globals)


let pageIdx        = 0;      // Indice sezione corrente (0-based)
let answers        = {};     // Map fieldName → valore risposta
let mediaFiles     = {};     // Map fieldName → File object
let outbox         = [];     // Array di moduli completati da inviare
                             // Struttura: [{answers, mediaFiles, savedAt, label}]
let sentForms      = [];     // Array di moduli già inviati (solo metadati)
let drafts         = [];     // Elenco bozze salvate
                             // Struttura: [{answers, mediaFiles, pageIdx, fieldIdx, savedAt, label}]
                             // window._editingDraft = indice della bozza in modifica (null = nuovo modulo)
let langReturn     = 'home'; // Dove tornare dopo la selezione lingua: 'home' | 'form'
let langReturnField= 0;      // window._fieldIdx da ripristinare se si torna al form


