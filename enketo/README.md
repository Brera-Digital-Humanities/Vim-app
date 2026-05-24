# Enketo Express — materiali e guida alla conversione

Questa cartella raccoglie tutto ciò che serve **se** in futuro si vorrà servire
il form VIM tramite [Enketo Express](https://github.com/enketo/enketo-express)
self-hosted, invece dell'app custom single-file (`dist/`).

Oggi il progetto **non** usa Enketo: l'app è generata da `src/` con
`scripts/build-app.sh` e invia i dati direttamente a KoboToolbox
(vedi `src/api.js`). Questo documento spiega come sarebbe la conversione.

## Cosa c'è in questa cartella

| Percorso | Cosa | Stato |
|---|---|---|
| `package-template/config/config.json` | Configurazione di esempio per Enketo Express | template |
| `theme/theme.scss` | Tema VIM per il DOM di Enketo (`.question`/`.paper`/`.btn`) | dormiente |

Il tema in `theme/theme.scss` è separato dagli stili dell'app custom
(`src/styles/`) perché Enketo ha un DOM diverso: il CSS dell'app custom
(`.phone-shell`, `.screen`…) **non** funziona su Enketo. In `src/build.order`
la sezione `[enketo-scss]` (dormiente, non letta da `build-app.sh`) elenca i
file di questo tema: `styles/tokens.scss` + `../enketo/theme/theme.scss`.

## A) Installazione di Enketo Express

```bash
git clone https://github.com/enketo/enketo-express
cd enketo-express
npm install
cp config/default-config.json config/config.json
# poi edita config/config.json (vedi sotto)
npm start
```

## B) Configurazione `config.json`

Vedi `package-template/config/config.json` come base. I campi chiave:

```jsonc
{
  "linked form and data server": {
    "name": "La valigia immateriale",
    "server url": "https://eu.kobotoolbox.org",
    "api key": "<API_KEY_KOBO>"
  },
  "encryption key": "<CHIAVE_CASUALE_32_CHARS>",
  "less secure encryption key": false,
  "port": 8005,
  "offline enabled": true,   // abilita il service worker offline di Enketo
  "maps": [ /* … */ ]
}
```

L'autenticazione verso KoboToolbox è gestita **server-side** da Enketo tramite
`api key`: il token non vive più nel client (a differenza dell'app custom, dove
è iniettato a build-time da `.env`).

## C) Endpoint di invio (sostituire `src/api.js`)

Su Enketo Express l'invio passa dall'endpoint OpenRosa nativo:

```
POST /submission
Content-Type: multipart/form-data
X-OpenRosa-Version: 1.0
```

Niente header `Authorization` (lo aggiunge il server). Il **formato XML
OpenRosa resta identico** a quello prodotto da `doSubmit()` in `src/api.js`:
basta cambiare URL ed header. In pratica:

```js
const response = await fetch(`${BASE}/submission`, {
  method: 'POST',
  headers: { 'X-OpenRosa-Version': '1.0' }, // niente Authorization
  body: formData,
});
```

In alternativa si può usare direttamente l'API nativa di Enketo
(`enketo-core/src/js/submission.js`), che gestisce già OpenRosa/XForm e gli
allegati media.

## D) Offline / service worker

Enketo Express include già un service worker per il caching offline. Con
`"offline enabled": true`, il form funziona offline e le submission vengono
accodate localmente (IndexedDB) e inviate quando torna la rete.

> L'app custom ha già un meccanismo equivalente (service worker in `src/pwa/`
> + outbox/bozze in IndexedDB via `src/core/storage.js`); su Enketo si userebbe
> quello nativo.

## E) Branding (tema VIM su Enketo)

1. Compila `theme/theme.scss` (+ `src/styles/tokens.scss`) in un `vim.css`.
2. Copia il CSS in `enketo-express/public/css/`.
3. Modifica `enketo-express/app/views/surveys/webform.pug` per caricarlo, o
   imposta `"theme": "vim"` in `config.json`.
4. `npm run build` lato Enketo.

## F) PWA

1. Servi su **HTTPS** (obbligatorio per PWA e accesso a media su iOS).
2. Apri su iPhone `https://<dominio>/x/<enketo_id>` → "Aggiungi a schermata Home".
3. Il service worker di Enketo gestisce già il caching.

## G) CORS

Se l'app è servita su un dominio diverso da KoboToolbox, aggiungi il dominio
alle origini consentite: KoboToolbox → Account → Security → API CORS Origins.
Oppure usa un proxy che aggiunge gli header CORS.
