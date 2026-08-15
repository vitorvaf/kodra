# Spec 0001 — `vagas.com.br` job ingestion

| | |
| --- | --- |
| **Task** | #3 — Criar uma nova ingestion (`https://www.vagas.com.br/vagas-de-tecnologia`) |
| **Status** | Draft — awaiting decision on §9 (fetching strategy) |
| **Date** | 2026-08-12 |
| **Template** | Mirrors the existing Sentry ingestion (client → store → API → poller → UI) |
| **Research** | `@explorer` Sentry wiring map + `@librarian` vagas.com.br site study (this session) |

---

## 1. Goal

Pull technology job postings from
`https://www.vagas.com.br/vagas-de-tecnologia` onto the kanbots board as
triage cards, the same way the Sentry integration pulls error groups in: a
background poller fetches listings, de-duplicates against a local imports
table, and creates one local issue per new posting in the **Inbox** column.

> **Assumption (state if wrong):** "ingestion" here means a Sentry-style
> external source that creates board cards from third-party items. The task
> name and the Sentry precedent both point here; this spec does **not**
> assume a generic/plugin ingestion framework (see §10 non-goals).

## 2. Background & prior art

### 2.1 The Sentry integration is the template

`@explorer` mapped it end-to-end. The new ingestion copies this skeleton:

| Layer | Sentry file | Vagas equivalent (new) |
| --- | --- | --- |
| Core client | `packages/core/src/sentry-client.ts` | `packages/core/src/vagas-client.ts` |
| Migration | `packages/local-store/src/migrations/0010-sentry.ts` | `…/migrations/0031-vagas.ts` (**0031 is the next free number**; `0011` is taken, `0019` reserved) |
| Config repo | `…/repos/sentry-config.ts` | `…/repos/vagas-config.ts` |
| Imports repo | `…/repos/sentry-imports.ts` | `…/repos/vagas-imports.ts` |
| IPC handlers | `packages/api/src/handlers/sentry.ts` | `packages/api/src/handlers/vagas.ts` |
| Poller | `packages/desktop/src/sentry-poller.ts` | `packages/desktop/src/vagas-poller.ts` |
| Settings UI | `packages/web/src/components/modals/SentrySettingsModal.tsx` | `…/modals/VagasSettingsModal.tsx` |

The Sentry poller only depends on `IssueSource.createIssue()` from the
source — the vagas poller reuses the exact same contract
(`packages/core/src/issue-source.ts`).

### 2.2 Site realities (`@librarian` study)

- **Rendering:** listing page is **server-side rendered HTML**; the first
  page of jobs is in the initial response. "Load more" (`#maisDoMes`) is a
  JS interaction — **no URL-based pagination** exists.
- **Protection:** behind **Cloudflare**; `robots.txt` blocks AI crawlers
  (GPTBot/ClaudeBot/…) but **does not disallow** `/vagas-de-tecnologia` or
  `/vagas/{id}/{slug}`. Disallowed paths to avoid: `/api/`, `/v1/`,
  `/auth/`, `/users/`, `/token/`, `/vagas/pesquisas`.
- **No official API / RSS / affiliate feed** exists. Internal API at
  `api.vagas.com.br` is `Disallow:` and undocumented.
- **ToS:** no explicit anti-scraping clause for **public** listings was
  found; restrictions target resume/CV data and the "Vagas For Business"
  recruiter software. **Flag for legal review** (§8).
- **DOM:** container `div#vagasDoMes` > `article`; title in
  `header h2.cargo a` (`title` attr + `href`); detail URL pattern
  `/vagas/{id}/{slug}`. Selectors have churned historically
  (`<li class="vaga">` → `<article>`), so the **stable key must be the
  numeric `{id}` from the detail URL**, not CSS classes.

## 3. Scope — v1 (this spec)

**In:**
- Poll **page 1** of the configured search URL on a timer (default 30 min).
- Parse listings, de-duplicate by `vaga_id`, create one Inbox card per new
  posting, record an import row.
- Settings UI (enable/disable, search URL, poll interval, sync-now, status).
- Honest User-agent, robots-respecting path scope, graceful block handling.

**Out / non-goals (§10):**
- "Load more" pagination / full-result crawl (deferred — see §9 decision).
- A generic/pluggable ingestion framework. This is a site-specific module.
- Applying to jobs via the site (no auth, no CV upload).
- Reverse-engineering the internal `api.vagas.com.br` endpoints.

## 4. Architecture (package by package)

### 4.1 `@kanbots/core` — `VagasClient`

```ts
// packages/core/src/vagas-client.ts
export class VagasRequestError extends Error {
  readonly status: number;
  constructor(status: number, message: string);
}
export class VagasBlockError extends Error {
  readonly status: number; // 403 / 503
  constructor(status: number, message: string);
}

export interface VagasClientOptions {
  searchUrl?: string; // default https://www.vagas.com.br/vagas-de-tecnologia
  userAgent?: string;  // default honest UA (see §8)
  fetch?: typeof fetch;
}

export interface VagasListing {
  vagaId: string;          // numeric id from /vagas/{id}/{slug}
  title: string;
  detailUrl: string;       // absolute
  company: string | null;
  location: string | null;
  salary: string | null;   // frequently null on this site
}

export class VagasClient {
  constructor(opts?: VagasClientOptions);
  listListings(): Promise<VagasListing[]>;       // page 1 only (v1)
  testConnection(): Promise<{ ok: true; count: number }>; // fetch + parse, no throw
}
```

- Mirrors `SentryClient`'s injectable-`fetch` shape for testability.
- Adds **`cheerio`** as a dep of `@kanbots/core` (the only HTML-parsing
  client; justified, and cheerio is the standard). Listed as a sub-decision
  in §9 in case core must stay parser-free.
- HTTP 403/503 → `VagasBlockError` (poller backs off). Other non-OK →
  `VagasRequestError`. **No auth errors** — public site, no token.
- Extracts `vagaId` from the anchor `href` path (`/vagas/{id}/{slug}`);
  falls back across resilient selector strategies (`article`, then legacy
  `li.vaga`) before giving up on a node.
- Relative `href`s are absolutized against `https://www.vagas.com.br`.

### 4.2 `@kanbots/local-store` — migration `0031_vagas` + repos

**Migration `0031_vagas`** — singleton config + imports, mirroring 0010:

```sql
CREATE TABLE vagas_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enabled INTEGER NOT NULL DEFAULT 0,
  search_url TEXT NOT NULL DEFAULT
    'https://www.vagas.com.br/vagas-de-tecnologia',
  user_agent TEXT,                 -- NULL = use client default
  poll_interval_seconds INTEGER NOT NULL DEFAULT 1800,
  last_synced_at TEXT,
  last_error TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0
);
INSERT INTO vagas_config (id) VALUES (1);

CREATE TABLE vagas_imports (
  vaga_id TEXT PRIMARY KEY,
  local_issue_number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'imported', -- imported | viewed | applied | dismissed
  title TEXT,
  company TEXT,
  location TEXT,
  salary TEXT,
  detail_url TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  FOREIGN KEY (local_issue_number)
    REFERENCES local_issues(number) ON DELETE CASCADE
);
CREATE INDEX idx_vagas_imports_local_issue ON vagas_imports(local_issue_number);
CREATE INDEX idx_vagas_imports_status ON vagas_imports(status);
```

> Simpler than `sentry_config` — **no token / no encryption** (public site,
> no `VagasRuntime` token plumbing, no `safeStorage`).

**Repos** (mirror sentry-config / sentry-imports APIs):
- `VagasConfigRepo`: `get()` / `update(patch)` / `recordFailure()` /
  `resetFailures()`.
- `VagasImportsRepo`: `findByVagaId(id)` / `findByLocalNumber(n)` /
  `mapByLocalNumber()` / `upsert(input)` (with
  `ON CONFLICT(vaga_id) DO UPDATE`) / `setStatus(n, status)`.
- Both attached to `Store` and re-exported from
  `packages/local-store/src/index.ts`.

### 4.3 `@kanbots/api` — IPC handlers `vagas:*`

```ts
// packages/api/src/handlers/vagas.ts
getConfig(deps): Promise<VagasConfigPayload>;
saveConfig(deps, args: VagasConfigInput): Promise<VagasConfigPayload>;
testConnection(deps): Promise<VagasTestConnectionResult>; // fetch+parse, report count
syncNow(deps): Promise<VagasSyncResult>;
setStatus(deps, args: { issueNumber: number; status: VagasImportStatus }): Promise<DecoratedIssue>;
```

Channels registered in `packages/api/src/handlers/index.ts`:

```
vagas:get-config
vagas:save-config
vagas:test-connection
vagas:sync-now
vagas:set-status
```

- **No `analyze` / `apply-suggestion`** (these are job leads, not errors to
  triage with Claude). `setStatus` replaces them and lets the user mark a
  lead `viewed | applied | dismissed`.
- `HandlerDeps` gains a `vagas: VagasRuntime` shaped like
  `{ syncNow(): Promise<VagasSyncResult>; restartPoller(): void }` —
  strictly smaller than `SentryRuntime` (no encrypt/decrypt/env).

Zod schemas mirror sentry's `.strict()` style:
`saveConfig` → `{ enabled?, searchUrl? (url, default Path), pollIntervalSeconds? (int 300–86400), userAgent? (string ≤500, nullable) }`.

### 4.4 `@kanbots/desktop` — `VagasPoller`

`packages/desktop/src/vagas-poller.ts`, structurally identical to
`sentry-poller.ts`:

```ts
interface VagasPollerOptions { store: Store; source: IssueSource; broadcast: () => void; }
class VagasPoller {
  constructor(opts: VagasPollerOptions);
  start(): void; stop(): void; restart(): void;
  runOnce(): Promise<VagasSyncSummary>;
}
```

`runOnce()` flow:
1. Read `vagasConfig`; no-op if `!enabled`.
2. Build `VagasClient({ searchUrl, userAgent })`; call `listListings()`.
3. For each listing: skip if `vagasImports.findByVagaId(vagaId)` exists
   (refresh `last_seen_at`/count metadata only). Otherwise:
   `source.createIssue({ title, body: formatVagasBody(listing) })` → record
   `vagasImports.upsert({ vagaId, localIssueNumber, … })`.
4. On success: update `last_synced_at`, clear `last_error`, reset failures,
   `broadcast()` if rows changed.
5. On `VagasBlockError`/`VagasRequestError`: increment
   `consecutive_failures`, store `last_error`, schedule next tick with
   exponential backoff (cap applied). Do **not** disable after N the way
   Sentry disables on auth failure — there's no auth to fix; instead
   backoff up to a ceiling and keep retrying.

- **Interval clamp:** 300–86400 s (5 min – 1 day); default **1800 s (30 min)**.
- Recursive `setTimeout` (not `setInterval`); `inFlight` coalesces concurrent
  syncs — both copied from the Sentry poller.
- Constants: `MAX_LISTINGS_PER_SYNC = 50` (safety cap on page-1 size).

`formatVagasBody()`:

```md
> Imported from vagas.com.br — [view listing](<detailUrl>)

**Cargo:** <title>
**Empresa:** <company | "Não informado">
**Local:** <location | "Não informado">
**Salário:** <salary | "Não informado">
```

New issues carry no `status:*` label → land in **Inbox**, matching Sentry.

Wired in `packages/desktop/src/main.ts` next to `sentryPoller`; a
`vagasRuntime: VagasRuntime = { syncNow: () => poller.runOnce(), restartPoller: () => poller.restart() }`
is passed as `deps.vagas`.

### 4.5 `@kanbots/web` — `VagasSettingsModal`

Clone `SentrySettingsModal.tsx`. Fields: **Enabled** toggle, **Search URL**
(default prefilled), **Poll interval**, advanced **User-agent override**,
**Sync now** button. Surfaces: last sync timestamp, last error,
consecutive failures, last-test connection count. Renderer wrappers added
to `packages/web/src/api.ts` (`getVagasConfig`, `saveVagasConfig`,
`testVagasConnection`, `syncVagasNow`, `setVagasStatus`). Imported cards are
visible on the normal board (no dedicated list view in v1).

## 5. End-to-end sync flow

```
VagasPoller tick
  → read vagas_config (enabled? searchUrl? userAgent?)
  → VagasClient.listListings()         [fetch page 1, parse HTML]
  → for each VagasListing:
       exists = vagas_imports.findByVagaId(vagaId)
       if exists → upsert metadata (refresh last_seen_at); skip
       else       → source.createIssue({title, body})
                  → vagas_imports.upsert({vagaId, localIssueNumber, …})
  → update vagas_config {last_synced_at, last_error=null, failures=0}
  → broadcast() if any new rows
```

## 6. Testing strategy

- **`VagasClient` unit tests** (`packages/core/tests`): inject a `fetch`
  stub returning a saved HTML fixture (real page snapshot captured once,
  committed under `packages/core/tests/fixtures/vagas-listing.html`).
  Assert: correct count of `VagasListing`, `vagaId` parsed from URL path,
  relative→absolute URL, missing-company/salary → `null`, 403/503 →
  `VagasBlockError`, selector churn fallback.
- **Repo tests** (`packages/local-store/tests`): upsert dedup by `vaga_id`,
  `findByVagaId`, cascade delete on `local_issues` removal, migration
  `0031_vagas` appears in the applied-migrations list. Mirror the existing
  `sentry-imports` / `migrations.test.ts` style.
- **Poller tests** (`packages/desktop/tests`): inject a fake `VagasClient`
  and a `FakeIssueSource` (already exists at
  `packages/api/tests/helpers/fakes.ts`); assert new-listing → one
  `createIssue`, repeat-listing → no new issue, block error → failure count
  increments + `last_error` set, broadcast fires only on change.
- **Manual/ live check** (not CI): `testConnection` against the real site
  behind a flag, documented as a smoke test, not an automated suite (site
  is third-party + Cloudflare; flaky in CI).

## 7. Compliance, robots & rate-limiting (read before implementing)

- **Honest User-Agent** identifying the app and a contact, e.g.
  `kanbots-vagas-ingestion/1.0 (+mailto:owner@example.com)`. **No UA
  spoofing.** Configurable via `vagas_config.user_agent`.
- **Path scope:** public listing + public detail pages only. Never request
  `/api/`, `/v1/`, `/auth/`, `/users/`, `/token/`, `/vagas/pesquisas`
  (robots-disallowed).
- **Rate:** one request per sync (page 1 only); default 30-min floor.
  Exponential backoff on blocks. No concurrent fetches.
- **Data:** store only public posting metadata (title/company/location/
  salary/link). No CV, no login, no recruiter-side data.
- **Legal review gate:** §8.

## 8. Risks

| # | Risk | Severity | Mitigation |
| --- | --- | --- | --- |
| R1 | Cloudflare 403/503 blocks the fetch | **High** | `VagasBlockError` → backoff; honest UA; pt-BR `Accept-Language`; surface `last_error` in UI. Accept that syncs may fail intermittently. |
| R2 | DOM selectors churn (`<li>`→`<article>`) | Med | `vagaId` from URL path (stable); multi-strategy selector fallback; fixture test + parse-failure alerting. |
| R3 | Page-1-only misses older/newer postings | Med | Accepted in v1; dedup accumulates new postings over time; §9 option B is the upgrade. |
| R4 | ToS / legal reuse of scraped data | Med | Public listings only; honest UA; **legal-review gate** before any non-personal use; document as a constraint in the settings modal. |
| R5 | `cheerio` added to `@kanbots/core` | Low | Acceptable (standard lib); revisit if core must stay parser-free (§9 sub-decision). |
| R6 | Salary frequently `null` on this site | Low | Schema allows null; body renders "Não informado". |

## 9. Decisions required before implementation

### Decision A — fetching strategy (critical)

| | Approach | Pros | Cons |
| --- | --- | --- | --- |
| **A1 (recommended)** | HTTP `fetch` + `cheerio`, **page 1 only** | Mirrors `SentryClient`; no heavy deps; dedup makes page-1 viable; fits desktop | Misses anything not on page 1 during a given poll |
| A2 | Hidden `BrowserWindow`/session in Electron for "load more" | Full results; reuses shipped Chromium (no new dep) | Couples client to desktop; harder to unit-test; heavier per sync |
| A3 | Add Playwright as a dep | Full results; cleanest headless API | Heavy dep; redundant in an Electron app; overkill for v1 |

**Recommendation: A1 for v1**, with the client interface (`listListings`)
written so A2/A3 can slot in later without touching the poller/store/UI.

### Decision B — parser dependency (minor, only if A1)

Add `cheerio` to `@kanbots/core`, **or** isolate the HTML parsing in a tiny
`parseVagasListing(html)` helper inside `packages/desktop` (keeping core
parser-free, like `SentryClient`).

**Recommendation:** `cheerio` in core (consistency with where domain
clients live). Revisit if you prefer core dependency-free.

### Decision C — product framing (confirm)

Confirm that job postings should become ordinary triage cards in Inbox
(Sentry-style), not a dedicated "Jobs" board view.

**Recommendation:** Inbox cards in v1 (matches precedent, least code).

## 10. Explicit non-goals

- A generic ingestion plugin framework / registry.
- "Load more" pagination / full crawl (deferred; §9 A2/A3).
- Authenticated features (apply, saved searches, alerts).
- Hitting `api.vagas.com.br` or any robots-disallowed path.
- UA spoofing or Cloudflare-bypass techniques.

## 11. Delivery plan (after §9 is resolved)

1. Migration `0031_vagas` + repos + store wiring + repo tests.
2. `VagasClient` (core) + fixture-based unit tests.
3. IPC handlers `vagas:*` + registration + `HandlerDeps.vagas`.
4. `VagasPoller` (desktop) + `main.ts` wiring + poller tests.
5. `VagasSettingsModal` (web) + `api.ts` wrappers.
6. Docs: row in `docs/architecture.md` (tables + IPC channels) and a
   section in `docs/issues.md` mirroring "Sentry import".
