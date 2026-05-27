# VIM — La valigia immateriale
## Setup tecnico, sviluppo e deploy in produzione

Documento di onboarding per chi prende in mano il progetto la prima volta.
Copre: setup ambiente, workflow di sviluppo, generazione dell'app, deploy.

### Indice della documentazione

| Documento | Per chi |
|---|---|
| **questo file (`SETUP.md`)** | Sviluppatore che lavora sul progetto: setup, build, workflow, deploy |
| [`src/README.md`](src/README.md) | Reference tecnica del form: sezioni, campi, lingue, mapping Kobo → JS |

---

## 1. Cos'è VIM

App web per la raccolta di patrimonio culturale immateriale palestinese.
Form digitale multilingua (Italiano, English, العربية con RTL) che simula
l'interfaccia di KoBoCollect su schermo mobile.

- **Backend dati:** KoboToolbox (server `eu.kobotoolbox.org`, UID form `<FORM-UID>`)
- **Definizione form:** presa da Kobo via `npm run sync` (rigenera `data.js`)
- **Target:** app web statica, PWA installabile su iPhone/Android, funziona offline

---

## 2. Struttura del progetto

```
vim-enketo/
├── src/                         ◄── SORGENTE (fonte di verità) — modulare
│   ├── build.order                   Ordine di concatenazione ([html],[js],[scss])
│   ├── app.html                      Guscio PWA a tutto schermo (body.app)
│   ├── demo.html                     Guscio demo con skin telefono (body.demo)
│   ├── partials/app-bar.html         Barra app condivisa dalle due pagine
│   ├── data.js                       PAGES + CHOICES + UID pubblico del form
│   ├── api.js                        Submit al backend VIM (doSubmit)
│   ├── manifest.json                 PWA manifest
│   ├── assets/logo.svg               Logo del brand (inline a build)
│   ├── i18n/                         Una lingua per file (it/en/ar + index)
│   ├── core/                         Logica condivisa (state, router, relevant…)
│   ├── screens/                      Una cartella per schermata (html + js + scss)
│   ├── styles/                       Design system condiviso (scss)
│   ├── pwa/                          service-worker.js + icons/
│   └── README.md                     Doc tecnica + come aggiungere una lingua
│
├── dist/                        ◄── GENERATO — la PWA reale (a tutto schermo)
│   └── index.html + manifest.json + service-worker.js + icons/
├── test/index.html              ◄── GENERATO — demo con skin telefono
│
├── enketo/                           Tutto ciò che riguarda Enketo Express
│   ├── package-template/config/      config.json
│   └── theme/theme.scss              tema Enketo (dormiente)
│
├── scripts/sync-kobo-form.js         Sync form da Kobo → src/data.js
├── scripts/build-app.sh              ◄── SCRIPT: src/ → dist/ + test/
└── SETUP.md                          questo file
```

### Principio fondamentale

**Si modifica SOLO `src/`.** Le cartelle `dist/` (PWA) e `test/` (demo) sono
**artefatti generati** da `scripts/build-app.sh` (gitignored). Modificarli a
mano significa perdere le modifiche al prossimo build.

---

## 3. Setup ambiente (una tantum)

### 3.1 Requisiti

| Tool | Versione minima | Note |
|---|---|---|
| `node` | 18+ | consigliato v22 LTS |
| `npm` | 9+ | viene con node |
| `bash` | 4+ | preinstallato su Linux/macOS, su Windows usare WSL |
| `git` | qualsiasi | per cloning |

> Tutte le **librerie di build** (`sass`, `http-server`) sono dichiarate in
> `package.json` e si installano localmente con `npm install`.
> **Nessuna installazione globale richiesta.**

### 3.2 Installazione su Linux/macOS

```bash
# 1. Node via nvm (se non già presente)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
# riapri il terminale, poi:
nvm install 22
nvm use 22
nvm alias default 22

# 2. Verifica
node --version    # v22.x.x
npm --version     # 10.x.x o 11.x.x
```

### 3.3 Installazione su Windows

Usare **WSL2** (Ubuntu) e poi seguire la sezione Linux/macOS.

```powershell
# In PowerShell come amministratore:
wsl --install -d Ubuntu
# Riavvia, apri Ubuntu, poi segui 3.2
```

### 3.4 Clone del progetto + installazione dipendenze

```bash
# Se è su Git
git clone <url-del-repo> vim-enketo
cd vim-enketo

# Oppure copia la cartella esistente
cp -r /percorso/sorgente/vim-enketo .
cd vim-enketo

# Installa le dipendenze (sass, http-server) in ./node_modules
npm install
```

### 3.5 Configurazione locale (.env) — **OBBLIGATORIO**

La PWA riceve solo l'UID pubblico del form e l'URL del backend VIM. Il token
KoboToolbox resta lato server, nel plugin WinterCMS, e non viene inserito nel
bundle client.

```bash
cp .env.example .env
nano .env       # → inserisci i tuoi valori reali
```

Variabili richieste:

| Variabile | Cosa | Dove la trovi |
|---|---|---|
| `VIM_KOBO_UID` | UID del form, inserito nella PWA | URL del form: `https://eu.kobotoolbox.org/#/forms/<UID>/` |
| `VIM_SERVICES_URL` | API backend VIM | es. `http://localhost:8085/api/v1` |
| `VIM_KOBO_TOKEN` | Solo per `npm run sync`, non per il build PWA | KoboToolbox → Account → Security → API Token |
| `VIM_KOBO_BASE` | Solo per `npm run sync` | `https://eu.kobotoolbox.org` (server EU) o `.org` (US) |

> **Sicurezza:** il file `.env` non finisce mai su Git. Se vuoi condividere
> il progetto, condividi `.env.example` (placeholder). Il token Kobo usato per
> l'invio reale va configurato in `platform/.env` come `KOBO_API_TOKEN`.

### 3.6 Verifica installazione

```bash
npm run check
# Dovrebbe stampare: OK src/data.js (e gli altri .js)

npm run build
# Dovrebbe finire con:
#   ▸ Built: dist/index.html  (~140 KB)
```

Se entrambi i comandi terminano senza errori, l'ambiente è pronto.

---

## 4. Workflow di sviluppo

### 4.1 Ciclo tipico

```
   (se il form è cambiato su Kobo)
        ┌──────────────────────────┐
        │ npm run sync              │ ◄─── aggiorna data.js da Kobo
        └──────────┬───────────────┘
                   │
        ┌──────────▼───────────────┐
        │   modifica src/      │ ◄─── edit qui (codice/stile/lingue)
        └──────────┬───────────────┘
                   │
        ┌──────────▼───────────────┐
        │ npm run build             │ ◄─── rigenera l'app
        └──────────┬───────────────┘
                   │
        ┌──────────▼───────────────┐
        │ npm start                 │ ◄─── apre browser su :8765
        └──────────┬───────────────┘
                   │
                ok? ──► no ──► torna su
                   │
                  sì ──► deploy (sez. 6)
```

> `npm run build` esegue `build:app` con `npm run check` (syntax check
> sui .js) come pre-hook automatico.

### 4.2 Cosa modificare per quale tipo di cambiamento

| Vuoi cambiare... | Modifica | Note |
|---|---|---|
| Colori, font, design tokens | `src/styles/tokens.scss` | usare CSS variables `var(--accent)`, mai hex diretti |
| Stile di una schermata | `src/screens/<schermata>/<schermata>.scss` | es. `screens/form/form.scss` |
| Stili condivisi (bottoni, modal, RTL…) | `src/styles/*.scss` | buttons, modal, feedback, rtl, responsive |
| Markup di una schermata | `src/screens/<schermata>/<schermata>.html` | es. `screens/form/form.html` |
| Guscio PWA / demo | `src/app.html` (full-screen) · `src/demo.html` (skin telefono) | schermi al marker `<!-- @screens -->`; app-bar via `<!-- @file:partials/app-bar.html -->` |
| Testi UI / aggiungere una lingua | `src/i18n/<lingua>.js` + `i18n/index.js` | vedi `src/README.md` → "Aggiungere una lingua" |
| Logica di una schermata | `src/screens/<schermata>/<schermata>.js` | es. form, outbox, drafts, lang |
| Navigazione tra schermate | `src/core/router.js` | showScreen, goHome… |
| Rendering campi, bozze, completamento | `src/screens/form/form.js` | renderPage, nextField, updateCompleteBtn (required+visibili) |
| Campi condizionali | `RELEVANT` in `data.js` (da Kobo); logica in `core/relevant.js` | sintassi XLSForm: `${campo}='valore'` |
| Endpoint o formato submit | `src/api.js` → `doSubmit` | invio al backend VIM, che inoltra a KoboToolbox |
| Definizione form (campi, ordine, scelte) | **su Kobo**, poi `npm run sync` | NON si edita `data.js` a mano |
| Aggiungere/togliere campi del form | `src/data.js` → `PAGES` e `CHOICES` | meglio rigenerare da XLSForm aggiornato |
| Nome/icone PWA | `src/manifest.json` | |
| Persistenza offline / coda invii | `src/core/storage.js` (IndexedDB), `src/screens/outbox/outbox.js` (`autoSync`) | record per modulo, instanceID, auto-invio — vedi sez. 7 |
| Cache offline / service worker | `src/pwa/service-worker.js` | HTML network-first, asset/font cache-first; cache versionata `vim-vN` |
| Ordine di concatenazione / nuovo file | `src/build.order` | aggiungi il path nella sezione `[js]` o `[scss]` |

### 4.3 Test locale (PWA + demo)

```bash
npm run build:app    # rigenera dist/index.html (PWA) e test/index.html (demo)
npm start            # serve dist/ (la PWA) su :8765 e apre il browser
npm run demo         # serve test/ (la demo con skin telefono) su :8766
```

In alternativa, se preferisci scegliere quale file aprire manualmente:

```bash
npm run serve             # http-server senza auto-apertura, su http://localhost:8765
```

> **NON** aprire il file con `file://`: service worker, cache e chiamate API
> richiedono un server statico (`npm start`).

### 4.4 Convenzioni di codice

- **Nessun framework, nessuna dipendenza npm a runtime.** Vanilla JS ES6+.
- **CSS variables sempre:** `var(--accent)`, mai `#c4763a`.
- **Animazioni standard:** `slideIn`/`slideBack` per transizioni di campo,
  `fadeIn`/`slideUp` per modal.
- **Modal:** sempre append dentro `.phone-shell` (per restare nella cornice).
- **RTL:** testare ogni modifica anche con la lingua araba (`isRTL = !!UI_LANGS[currentLangIdx].rtl`).
- **Syntax check obbligatorio** prima di ogni commit. Lo script di build
  lo fa automaticamente con `node --check`.

---

## 5. Generazione dell'app

Dallo stesso sorgente `src/` si genera l'app completa in un singolo file.

```bash
npm run sync     # scarica il form da Kobo → rigenera src/data.js
npm run build    # genera dist/index.html (app completa)
npm start        # http-server :8765 + apre l'app nel browser
npm run serve    # http-server senza auto-apertura
npm run check    # syntax check su tutti i .js
npm run clean    # rimuove le cartelle generate (dist/ e test/)
```

`scripts/build-app.sh` concatena gli SCSS (per `build.order`) e li compila
in-line; concatena `data.js` + i frammenti JS + `api.js`; espande gli schermi
e l'app-bar condivisa in `app.html` e `demo.html`; inietta configurazione
pubblica dal `.env` e il logo `assets/logo.svg` come data-URI. Produce due file autonomi:
`dist/index.html` (PWA a tutto schermo) e `test/index.html` (demo con skin).

> Nota storica: il progetto aveva anche una pipeline per generare un tema
> Enketo Express (`build_enketo_package.sh` + Docker). È stata rimossa per
> concentrarsi sull'app custom; resta recuperabile dalla storia git, e tutto
> il materiale Enketo (config + tema) è ora raccolto in `enketo/`.

---

## 6. Deploy

L'app è un **sito statico**: un file HTML autocontenuto, nessun backend di
rendering. Deployarla significa **servire il file su un host HTTPS**.

- **Dove:** qualsiasi hosting statico (Netlify, GitHub Pages, Cloudflare
  Pages) o un web server (nginx/Apache) che serve `dist/index.html`.
- **HTTPS obbligatorio** per: installazione come PWA e accesso
  fotocamera/microfono su iOS (non funziona su `http://` da remoto).
- **Invii:** l'app invia i dati al backend VIM, che inoltra a KoboToolbox con
  il token server-side.
- **Offline / PWA:** service worker + IndexedDB già attivi — vedi sez. 7
  (Offline, storage e sincronizzazione). Su HTTPS la PWA si installa su
  iPhone/Android ("Aggiungi a schermata Home").

---

## 7. Offline, storage e sincronizzazione

L'app è una PWA pensata per l'uso sul campo, anche senza rete. Lo storage locale
è un **buffer**: la fonte di verità resta KoboToolbox, su cui i moduli vengono
inviati appena c'è connessione.

### 7.1 Apertura offline (service worker)

`src/pwa/service-worker.js` (servito da `dist/`) gestisce la cache:
- **HTML**: *network-first* → online prendi sempre l'ultimo build, offline ricadi
  sulla cache (così i tester ricevono gli aggiornamenti senza restare bloccati su
  una versione vecchia).
- **Asset statici + Google Font**: *cache-first* (i font funzionano offline dopo
  un primo caricamento online).
- Le richieste di invio passano sempre dalla rete e vengono fatte verso il
  backend VIM.

Richiede HTTPS o `localhost`. La cache è versionata (`vim-vN`): alzando la
versione la vecchia viene ripulita all'attivazione del nuovo service worker.

### 7.2 Dati persistenti (IndexedDB)

`src/core/storage.js` salva su IndexedDB (DB `vim`, versione 2):
- **un record per bozza e per modulo in coda** (store `drafts` / `outbox`, chiave =
  instanceID) → scritture mirate, niente rewrite dell'intero elenco, i media
  (Blob) sopravvivono.
- singoletti (moduli inviati, login, lingua) nello store `state`.
- **storage persistente**: all'avvio l'app chiama `navigator.storage.persist()`
  per non farsi cancellare i dati; avvisa nella home se l'uso supera il 90%.

C'è una migrazione automatica dai dati del vecchio schema (v1) ai record (v2),
così non si perdono bozze/outbox già salvati.

### 7.3 Invio e idempotenza

- Ogni modulo ha un **instanceID** stabile (`uuid:…`), generato all'inizio della
  compilazione e mantenuto da bozza fino all'invio. Finisce in
  `<meta><instanceID>` dell'XML OpenRosa → Kobo **deduplica** i re-invii: niente
  doppioni anche con i retry.
- **Auto-invio** (`autoSync` in `src/screens/outbox/outbox.js`): svuota la coda
  quando torna la rete, all'avvio e dopo aver completato un modulo, con retry
  periodico. Restano disponibili l'invio manuale ("Invia" / "Invia tutti").

### 7.4 Su iOS

Per ridurre il rischio che Safari cancelli i dati (eviction dopo ~7 giorni di
inutilizzo), **installa la PWA su Home** e servi in **HTTPS**: lo storage
persistente diventa più affidabile.

> Perché non SQLite? In un browser non esiste SQLite "vero"; IndexedDB è il
> database nativo ed è la scelta corretta. SQLite-WASM persisterebbe sullo stesso
> storage (stesse regole di cancellazione), senza vantaggi di durabilità.

---

## 8. Troubleshooting

| Problema | Diagnosi | Soluzione |
|---|---|---|
| `sass: command not found` | `node_modules/` mancante | `npm install` nella root del progetto |
| `node` v13 o inferiore | versione obsoleta | `nvm install 22 && nvm use 22` |
| `npm install` fallisce con `EACCES` | permessi sbagliati su `node_modules/` | `rm -rf node_modules && npm install` (mai con `sudo`) |
| `npm start` dice `EADDRINUSE: 0.0.0.0:8765` | un altro server gira sulla porta | trova porta libera con `ss -tln \| grep LISTEN`, poi `npx http-server dist -p <PORTA> -c-1 -o /index.html` (oppure modifica `package.json` → `scripts.start`) |
| Build fallisce con `ERRORE: src/XX mancante` | file sorgente eliminato | controllare `src/`, ripristinare dal backup |
| Browser mostra pagina vuota | app aperta da filesystem o build incompleto | usare server statico, NON `file://` |
| Submit fallisce con 401/403 | sessione VIM scaduta o login non valida | fare logout/login; la coda resta locale e riprova dopo l'accesso |
| Submit fallisce con 500 e `KOBO_API_TOKEN is not configured` | token backend mancante | configurare `KOBO_API_TOKEN` in `platform/.env` |
| Submit fallisce con 4xx/5xx Kobo | errore di validazione o token Kobo lato backend | controllare risposta backend e configurazione `KOBO_*` in WinterCMS |
| iOS non chiede camera/microfono | HTTP non HTTPS | servire su HTTPS |
| `npm run sync` fallisce | token/UID errati o niente rete | controlla `.env`; il form dev'essere deployato su Kobo |

---

## 9. Sicurezza e produzione

### 9.1 Credenziali nel repo

- **TOKEN API KoboToolbox:** non viene inserito nel build della PWA. Il token
  serve solo per `npm run sync` locale e per il backend WinterCMS che inoltra
  gli invii a Kobo.
- **Artefatto senza segreti Kobo:** `dist/index.html` contiene solo il Kobo UID
  pubblico e l'URL dei servizi VIM. Gli invii passano da WinterCMS con JWT
  utente.
- **Nodo invii:** la PWA invia a `/api/v1/kobo/submissions`; WinterCMS tiene il
  token server-side e inoltra il multipart OpenRosa a KoboToolbox.

### 9.2 In produzione

- **HTTPS obbligatorio** per accesso camera/microfono da iOS e per
  installazione PWA.
- **Limiti upload media:** se servi tramite un proxy/web server, alza il
  limite di dimensione del body (es. `client_max_body_size 100M` in nginx)
  per audio/video lunghi.

---

## 10. Aggiornare il form

Il form vive su KoboToolbox ed è la fonte di verità della sua struttura.

1. Modifica il form su KoboToolbox (campi, ordine, traduzioni, condizioni,
   obbligatorietà)
2. **Salva e ridistribuisci** (Redeploy) su Kobo
3. `npm run sync` → rigenera `src/data.js` (PAGES + CHOICES + RELEVANT)
4. `npm run build` → rigenera l'app

Non si edita `data.js` a mano. La grafica VIM si applica automaticamente ai
campi aggiornati. (Limite: tipi di campo nuovi non ancora supportati dal
rendering custom vanno aggiunti una volta — vedi `src/README.md`.)

---

## 11. Risorse

- **Documentazione tecnica dettagliata:** `src/README.md`
- **KoboToolbox API v2:** https://kobo.kobotoolbox.org/api/v2/
- **KoboToolbox API v2:** https://kobo.kobotoolbox.org/api/v2/
