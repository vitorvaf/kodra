# Relatório Técnico — O que muda no Kodra após o login

> Escopo: comportamento do sistema (monorepo `packages/`) quando um usuário autentica.
> Referências no formato `arquivo:linha` apontam para o código-fonte que fundamenta cada afirmação.

---

## 1. Visão geral

O Kodra é **local-first**: o aplicativo inicia e opera integralmente offline, sem conta.
O login descrito aqui é o **sign-in opcional no Kodra Cloud** (backend em
`app.kanbots.dev` por padrão). Ele **não desbloqueia o núcleo do produto** — quadro
kanban, dispatch de agentes, autopilot, chat e MCP continuam funcionando sem sessão.
O que o login acrescenta é um **eixo paralelo de workspaces remotos**: organizações,
projetos, cards, runs e custos hospedados na nuvem, compartilháveis com um time.

Existem **três camadas de autenticação independentes** no sistema, e confundi-las é a
fonte mais comum de mal-entendido:

| Camada | O que autentica | Onde vive | Efeito |
| --- | --- | --- | --- |
| **Kodra Cloud** (este relatório) | Conta do próprio sistema | `cloud-config.json` cifrado | Workspaces/cards/runs remotos |
| **GitHub** (`gh auth login`) | Token do GitHub | Credenciais do `gh`/ambiente | Habilita o *modo GitHub* (issues reais, PRs) |
| **CLIs de agentes** (`claude login`, etc.) | Credenciais de cada provedor | Arquivos dos próp CLIs (`~/.claude`, …) | Apenas disponibilidade do provedor no dispatch |

Cada camada é verificada de forma isolada; estar logado em uma não afeta as outras.

---

## 2. O login do sistema (Kodra Cloud)

### 2.1 Fluxo de entrada — Device Authorization Grant

Não há formulário de senha dentro do app. O login usa o fluxo de **device code**
(RFC 8628), disparado pela UI:

1. **Entry points de UI**
   - Primeira execução: `CloudFirstRunPrompt` mostra um CTA opcional
     "Sign in to Kodra Cloud" com a opção "Continue locally" (dispensa permanente)
     — `web/src/components/CloudFirstRunPrompt.tsx:49-89,132-148`.
   - A qualquer momento: `CloudSettingsModal`, aba de conta
     — `web/src/components/modals/CloudSettingsModal.tsx:184-264`.

2. **Início do fluxo** — o renderer chama `bridge.cloudLoginStart()`
   (`web/src/global.d.ts:97-99` → `desktop/src/preload.ts:122-125` → IPC
   `kanbots:cloud-login-start` em `desktop/src/main.ts:1435-1456`), que executa:

   ```text
   POST {baseUrl}/api/v1/agent/devices/start   body: { scope: "user" }
   ```

   (`desktop/src/cloud-auth.ts:223-240`). A resposta traz `device_code`,
   `user_code`, `verification_uri_complete`, `expires_in` e `interval`.

3. **Browser** — o Electron abre `verification_uri_complete` via
   `shell.openExternal()` (`cloud-auth.ts:254-272`). O usuário approve no site;
   não há deep-link de volta ao app.

4. **Polling** — o modal agrupa o polling no renderer
   (`CloudSettingsModal.tsx:184-224`); o processo principal repassa para:

   ```text
   POST {baseUrl}/api/v1/agent/devices/poll   body: { device_code }
   ```

   (`cloud-auth.ts:281-351`). Estados possíveis: `pending`, `approved`
   (resposta contém `token`, `token_id`, `org_id`), `expired` (local por
   `expiresAt`, ou HTTP 404/410) e `cancelled`.

### 2.2 Persistência da sessão

- **Arquivo**: `cloud-config.json` no `userData` do Electron
  (`desktop/src/cloud-auth.ts:84-86`). CLI e MCP leem o caminho equivalente por
  plataforma (`~/.config/kanbots` no Linux) — `cli/src/auth.ts:10-20`,
  `mcp/src/auth.ts:13-24`.
- **Formato (v1)**: `{ v, encryption: "safe"|"plain", token_buffer_b64, base_url, token_id, token_prefix, org_id, signed_in_at, prompt_dismissed_at }`
  (`cloud-auth.ts:17-27`).
- **Proteção**: o token é cifrado com `safeStorage` do Electron (fallback: base64
  plain) e o arquivo é gravado com modo `0600` (`cloud-auth.ts:100-131`).
- CLI e MCP **não decifram** o token; apenas inspecionam `v === 1` +
  `token_id` não vazio para saber que há sessão (`cli/src/auth.ts:34-53`,
  `mcp/src/auth.ts:38-56`).

### 2.3 Requisições autenticadas pós-login

- O processo principal mantém um singleton `cloudClient` com **resolução lazy**
  de token e base URL (`desktop/src/main.ts:272-291`) — login/logout/rotação são
  percebidos sem reconstruir o cliente.
- Todo request resolve credenciais na hora e envia
  `Authorization: Bearer <token>`; sem token, lança
  `CloudClientError('UNAUTHENTICATED')` (`cloud-client/src/http.ts:75-128`).
- Identidade: `GET /api/v1/users/me` (`cloud-client/src/index.ts:275-286`).
- Streams SSE de runs cloud também enviam o bearer
  (`cloud-client/src/index.ts:528-537`).

### 2.4 Logout e expiração

- **Logout** é local: IPC `kanbots:cloud-logout` → `clearCloudAuth()`, que cancela
  login pendente e regrava o config sem token (preservando
  `prompt_dismissed_at`) ou deleta o arquivo (`cloud-auth.ts:353-382`).
  **Não há revogação server-side** do token.
- **Não há refresh proativo**: token invocado/inválido manifesta-se como erro
  HTTP nas chamadas; falha de decifragem gera `UNAUTHENTICATED`.

---

## 3. O gate central: `CLOUD_REQUIRED_CHANNELS`

O coração do modelo pós-login é um único mecanismo em
`desktop/src/main.ts:1131-1189`: um wrapper de `ipcMain.handle` que intercepta os
canais IPC listados em `CLOUD_REQUIRED_CHANNELS` e **rejeita com
`CloudAuthRequiredError` quando `getCloudStatus().authed === false`**. Todos os
demais canais IPC são pass-through — o app opera 100% offline.

Ou seja: **"estar logado" = ter sessão Cloud válida = ter permissão para cruzar
esse conjunto de ~30 canais que falam com `app.kanbots.dev`.** Nada mais no
processo local é alterado pelo login.

---

## 4. Funcionalidades desbloqueadas após o login

Inventário completo por grupo (canais em `main.ts:1139-1171`, handlers registrados
em `main.ts:1475-1906`):

### 4.1 Identidade, organizações e projetos
- `cloud:users-me` — identidade da conta.
- `cloud:orgs-list` / `cloud:orgs-create` — navegar/criar organizações.
- `cloud:projects-list` / `cloud:projects-create` — listar/criar projetos cloud.

### 4.2 Boards remotos (cards)
- CRUD completo de cards cloud: `cards-list/create/get/update`,
  `cards-archive/unarchive`.
- Comentários: `comments-list/add`.
- Anexos: `attachments-list`.
- Os cards remotos são adaptados ao modelo normal do quadro por
  `web/src/cloud-adapter.ts:20-201` — a UI do board é a mesma; a fonte de dados
  muda.

### 4.3 Runs de agentes na nuvem
- `runs-list-for-card`, `runs-create/get`, `runs-stop`, `start-agent-run`.
- Streaming de eventos via SSE: `runs-stream-start/stop`
  (`main.ts:1706-1906`).
- **Custo**: `cloud:cost-today` — consumo agregado do projeto cloud.

### 4.4 Workspaces cloud e binding com repositório local
- `open-cloud-workspace` / `close-cloud-workspace` /
  `recent-cloud-workspaces` — ciclo de vida de workspaces remotos.
- `project-binding-get/set/clear` — associa um projeto cloud a um checkout
  local, permitindo que cards/runs cloud operem sobre um repositório local
  (armazenamento em `desktop/src/cloud-bindings.ts`).

### 4.5 Compartilhamento com time
- A UI descreve projetos cloud como armazenamento remoto de tasks/runs
  compartilhado com o time (`CloudWorkspacePicker.tsx:124-126`,
  `CloudSettingsModal.tsx:349-351`). Importante: a implementação atual é
  **workspaces remotos**, não sincronização transparente das tabelas SQLite —
  `sync_state` e `cloud_account` são stubs de migração no banco local
  (`docs/architecture.md:148-151`).

### 4.6 O que NÃO existe
- **Nenhuma lógica de entitlement/plano/cota** vinculada ao login foi encontrada.
  Não há tier de assinatura, limite de uso ou feature-flag de plano no cliente;
  o gate é binário (sessão válida ou não).

---

## 5. O que NÃO muda sem login (modo local-first completo)

Sem sessão Cloud, tudo isto continua disponível (canais fora do gate +
`docs/getting-started.md:1-9`):

- Abrir pastas locais e reabrir workspaces recentes (`WorkspacePicker.tsx:33-59`).
- Quadro kanban completo com issues em **SQLite local** (criar, editar,
  arquivar, comentários) — `local-store/src/local-issue-source.ts:15-59`.
- **Dispatch e runs de agentes locais**: stream de eventos, diffs, worktrees,
  resultados.
- **Autopilot** local (orquestração paralela de agentes).
- Chat, memory, personas, configurações de repositório, fluxos git/worktree.
- Sentry import (se configurado independentemente com token próprio).
- **MCP local** — o servidor MCP sobe sem credenciais Cloud
  (`mcp/src/server.ts:11-17`).

---

## 6. Mudanças de UI/UX entre estados

| Estado | Comportamento |
| --- | --- |
| **Primeira execução** | Prompt opcional único; "Continue locally" dispensa permanentemente (`App.tsx:413-429`). Nunca bloqueia. |
| **Deslogado (picker)** | Picker local por padrão; rodapé "Want team sync? Sign in to Kodra Cloud"; sem opção "Browse cloud projects" (`WorkspacePicker.tsx:118-153`). |
| **Logado (picker)** | Mostra "Signed in to Kodra Cloud", "Browse cloud projects" e "Sign out" (`App.tsx:433-457`). |
| **Cloud picker** (só logado) | Projetos recentes, listagem de org/projeto, criação inline de org e projeto, retorno ao modo local (`CloudWorkspacePicker.tsx:21-115`). |
| **Settings Cloud** | Deslogado: controles de sign-in, "Local-first. Cloud is optional." Logado: metadados da sessão, sign-out, controles de binding, "Your work syncs to the cloud while signed in." (`CloudSettingsModal.tsx:338-404`). |
| **Workspace cloud aberto** | `App.tsx:397-403` instala o contexto org/projeto em `api.ts`; o board renderiza normalmente via `cloud-adapter.ts` (modo "cloud" no `api.ts:113-134,221-251`). |

---

## 7. CLI e MCP após o login

- **CLI** (`packages/cli`): não há fluxo `kanbots login` implementado; o CLI
  apenas **descobre** a sessão criada pelo desktop lendo `cloud-config.json`
  (`cli/src/auth.ts:5-53`) e protege subcomandos cloud com `requireCloudAuth()`
  (`cli/src/auth.ts:56-71`).
- **MCP** (`packages/mcp`): servidor sempre sobe local-only. Detecta sessão pela
  config do desktop (`mcp/src/auth.ts:38-56`); ferramentas cloud chamam
  `requireCloudSession()` e falham com `CloudAuthRequiredError` quando
  deslogado, com dica anexada: *"Sign in via the Kanbots desktop app to enable
  cloud features."* (`mcp/src/auth.ts:58-75`, `server.ts:66-93`). O login não
  "liga" o MCP — apenas destrava as tools dependentes de cloud.

---

## 8. Camada separada: login GitHub (modo GitHub × modo local)

Independente do Cloud, o token GitHub habilita o **modo GitHub** do workspace:

- **Detecção** (`core/src/auth.ts:16-59`): resolve na ordem `gh auth token` →
  `GITHUB_TOKEN` → `~/.kanbots/token`; sem token, `KanbotsAuthError`. A própria
  resolução bem-sucedida é o "check" de autenticação.
- **O que muda** (`desktop/src/main.ts:452-466`, `core/src/github-client.ts:129-289`):
  issues reais do repo viram cards; labels `status:*`/`agent:*` espelham
  movimentos no GitHub; comentários sincronizam pela API; **promote/draft PR e
  review comments são exclusivos do modo GitHub** (`main.ts:410-428`).
- **Persistência**: modo gravado em `.kanbots/config.json` como
  `{ mode: 'github', owner, repo }` ou `{ mode: 'local', name, authorLogin }`
  (`local-store/src/workspace.ts:9-19,92-108,315-350`).
- Runs concluídos aplicam `status:review` + `agent:idle` na fonte ativa —
  labels reais no GitHub vs. registros locais (`main.ts:618-680`).

## 9. Camada separada: logins dos CLIs de agentes

Os módulos `desktop/src/*-auth.ts` **não orquestram login** (exceto Claude/Codex,
que têm fluxo próprio); eles **sondam** arquivos de credencial de cada CLI e
retornam `{ authed: boolean }` (ex.: `copilot-auth.ts:5-43`). O usuário autentica
no CLI externo; o app reflete o estado no próximo poll. Isso afeta apenas a
**disponibilidade do provedor no modal de dispatch** — não confere nenhum
privilégio do sistema.

---

## 10. Segurança e observações finais

1. **Superfície mínima**: o token Cloud só existe no processo principal do
   Electron, cifrado em repouso (`0600`); renderer, CLI e MCP nunca manipulam o
   token em claro (CLI/MCP só leem metadados).
2. **Logout local**: sem endpoint de revogação — se o token vazar, permanece
   válido no servidor até expiração política do backend.
3. **Sem refresh**: sessões longas dependem da validade server-side do token.
4. **Gate binário, sem planos**: nenhuma lógica de entitlement foi encontrada no
   cliente; todo o gating é presença/ausência de sessão.

## 11. Resumo em uma frase

> Fazer login no Kodra **não altera nada no que já funcionava localmente** —
> apenas destrava, via `CLOUD_REQUIRED_CHANNELS`, um conjunto fechado de
> operações contra `app.kanbots.dev` (orgs, projetos, cards, runs, custos e
> bindings), apresentado na UI como um segundo tipo de workspace, compartilhável
> com o time.
