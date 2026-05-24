// VIM — application state (globals)


let pageIdx        = 0;      // Indice sezione corrente (0-based)
let answers        = {};     // Map fieldName → valore risposta
let mediaFiles     = {};     // Map fieldName → File object
let outbox         = [];     // Array di moduli completati da inviare
                             // Struttura: [{answers, mediaFiles, savedAt, label}]
let sentForms      = [];     // Array di moduli già inviati (solo metadati)
let draftAnswers   = null;   // Bozza salvata (copia di answers)
let draftPage      = 0;      // Indice sezione della bozza salvata
let langReturn     = 'home'; // Dove tornare dopo la selezione lingua: 'home' | 'form'
let langReturnField= 0;      // window._fieldIdx da ripristinare se si torna al form


