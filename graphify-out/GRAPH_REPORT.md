# Graph Report - kodra  (2026-09-14)

## Corpus Check
- 499 files · ~426,923 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 5200 nodes · 10149 edges · 246 communities (228 shown, 18 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 313 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- API Bridge & Handler Types
- Vendored Eruda DevTools
- Desktop Bridge Types
- Chat & Workspace Handlers
- Task Detail Modal & Issues
- Renderer Bridge Typings
- Desktop Main & Auth
- ADRs & Vagas Spec
- Prefs Store & Board Views
- LLM Slash Commands & Catalogue
- Issue & Agent Action Handlers
- SQLite Migrations
- Cloud Client
- Workspace Config & Store
- Board, Cards & Labels
- Chat App & Run Streams
- Agent Runs & Ship Handlers
- Subscription Cost Fetchers
- Task Detail Actions & Sentry Modal
- Core Issue Source & Mappers
- Local Store DB & Repos
- Dispatcher Package Manifest
- Core Package Manifest
- Web API Client & Cloud Adapter
- MCP Package Manifest
- Local Store Package Manifest
- Root Package Manifest
- Stream Parser
- LLM Package Manifest
- Cloud Settings & Worktrees Rail
- Web Package Manifest
- Workspace Bootstrap Handlers
- Cards & Review Comments Repos
- Composer & Drafting
- Task Create & Split Modals
- Workspace Tree Rail
- Agent Run Supervisor Core
- Desktop IPC Registration
- Desktop Bridge Adapter
- Autopilot Launch & Personas
- Stats & Run Summary
- Desktop Dev Dependencies
- Supervisor Orphan Reaping
- Dispatcher Worker & Checks
- Agent Runs Repo
- Chat Sessions Repos
- Issue Relations & Autopilot Handlers
- Sentry Poller
- Preview Proxy
- Local Issues Source
- Board Agent Streams & Column
- Sentry Curator
- Sentry Client
- Preview Proxy Benchmark
- Autopilot Sessions Repo
- Desktop Updater & Types
- CLI Package
- PR Modal & Model Picker
- Cloud Auth
- Autopilot Orchestrator Loops
- Handler Test Kit
- Board Page & Selection
- Provider Handlers
- Markdown Editor & Renderer
- npx CLI Manifest
- Core GitHub Tests
- Providers Repo
- Inline Diff Viewer
- Adapter Registry & ACP
- Learnings Repo
- Messages & Promotions Repos
- Cloud Client Manifest
- Workspace Tree IPC
- File Change Viewer
- npx Postinstall
- Core Labels & Issue Refs
- Card Templates Settings Modal
- Providers Settings Modal
- Card Templates Handlers
- Bridge Package Manifest
- Codex CLI Adapter
- Worktree & Identity
- Base TSConfig
- Kodra Brand Assets
- Fake Issue Source & Reconcile
- Supervisor Interface & Stubs
- Autopilot Manager
- Analytics Handlers
- AgentMemory Client
- Electron Builder Config
- Diff Hunks Repo
- App Shell & Routing
- Attachments & Cards Handlers
- Workspace Repos Settings Modal
- Sentry Handlers
- Memory Flow Tests
- Desktop Build Scripts
- Claude Auth
- Agent Events Repo
- MCP Server & Auth
- Web TSConfig
- Memory Session Bridge
- Cloud Run Dispatcher
- IPC Subscriptions
- Cursor CLI Adapter
- Dispatcher Test Helpers
- Chat Session Dropdown
- Tool Use Cards
- API Package Manifest
- Composer Suggestions
- Provider Credentials
- Instance Lock
- Desktop TSConfig
- Preview Inspect Script
- ACP Protocol
- Sentry Imports Repo
- Replay Buffer
- Cloud Client TSConfig
- Core Auth & Errors
- Cloud Bindings
- Sentry Analyzer
- Issue Relations Repo
- Workspace Repos Repo
- Preview Panel
- npx Launcher
- Supervisor Handle Wiring
- Review Comments Handlers
- Agent Checks Handlers
- Agent Checks Repo
- Card Templates Repo
- Repo Scripts Settings Modal
- Desktop Dependencies
- API TSConfig
- GitHub Client
- Core TSConfig
- Containment Scanner
- Sentry Config Repo
- Threads Repo
- Local Store TSConfig
- Agent Usage Row
- Release Workflow
- RTK & Configuration Docs
- Agent Docs Concepts
- Provider & Issue Docs
- Bridge TSConfig
- CLI TSConfig
- OpenCode CLI Adapter
- Board Filters
- Bulk Action Bar
- Cloud First-Run Prompt
- Docs Index
- MCP Server Docs
- API Dependencies
- Learnings Handlers
- Droid CLI Adapter
- Gemini CLI Adapter
- Qwen CLI Adapter
- Dispatcher TSConfig
- LLM TSConfig
- MCP TSConfig
- Memory Settings Modal
- README Run Lifecycle
- npx Launcher Docs
- Agent CLI Slash Commands
- AgentMemory Client Interface
- Desktop Package Meta
- DB Watcher
- MCP Composition
- Persona Picker Screenshot
- API Dev Dependencies
- Chat Tools Dispatch
- Codex Auth
- Model Pricing
- Prettier Config
- README Agent Features
- New Task Modal Screenshot
- Copy Web Script
- Antigravity CLI Adapter
- Web Test Bridge
- Agent CLI Picker Screenshot
- Autopilot Screenshot
- Board Overview Screenshot
- Chat Panel Screenshot
- Awaiting Decision Screenshot
- Task Detail Screenshot
- API Scripts
- Autopilot Dispatch Helpers
- Autopilot Manager Interface
- Event Dedup
- Mac Build Config
- Error Boundary
- Sibling Briefing
- Workspace Accessors
- Card Dispatch Tools Tests
- CLI Cloud Auth
- Linux Build Config
- NSIS Installer Config
- Font Licenses
- Collapsible Section
- Releasing Docs
- npx Verify Script
- Supervisor Tests
- Frame Error Reporting
- GitHub Publish Config
- Before Pack Script
- Card Ship Panel
- Font Subset Tool
- API Keywords
- API Repository Meta
- README Packages
- Linux Installer Script
- Agent Docs Runtime Notes
- Board Error Banner
- Board Toolbar
- Workspace Cost Meter
- Kodra Pulse
- Logo Component
- Shell Component
- Window Component
- Rail Icons
- Codex Provider Plan Doc
- Providers Doc
- Rebranding Doc

## God Nodes (most connected - your core abstractions)
1. `parseArgs()` - 133 edges
2. `createHandlers()` - 128 edges
3. `KanbotsBridge` - 93 edges
4. `KanbotsBridge` - 92 edges
5. `badRequest()` - 64 edges
6. `getBridge()` - 60 edges
7. `registerIpc()` - 58 edges
8. `T()` - 55 edges
9. `createSupervisor()` - 53 edges
10. `notFound()` - 53 edges

## Surprising Connections (you probably didn't know these)
- `StreamEvent` --implements--> `Agent stream event taxonomy`  [INFERRED]
  packages/dispatcher/src/stream-parser.ts → docs/agents.md
- `Electron process model (no HTTP for renderer)` --references--> `AgentSupervisor`  [EXTRACTED]
  docs/architecture.md → packages/api/src/agent-runs/supervisor.ts
- `AgentSupervisor` --implements--> `Cost budgets (runCostBudgetUsd / sessionCostBudgetUsd)`  [EXTRACTED]
  packages/api/src/agent-runs/supervisor.ts → docs/agents.md
- `Startup environment variables (KANBOTS_*)` --references--> `resolveGitHubToken()`  [EXTRACTED]
  docs/configuration.md → packages/core/src/auth.ts
- `GitHub issue mode` --references--> `resolveGitHubToken()`  [EXTRACTED]
  docs/issues.md → packages/core/src/auth.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Release pipeline: bump -> prepare-release -> build matrix -> electron-builder publish** — _github_workflows_release_bump, _github_workflows_release_prepare_release, _github_workflows_release_build, _github_workflows_release_electron_builder [EXTRACTED 1.00]
- **@kanbots/* packages forming the pnpm monorepo** — pnpm_workspace_workspace, readme_kanbots_core, readme_kanbots_local_store, readme_kanbots_dispatcher, readme_kanbots_llm, readme_kanbots_api, readme_kanbots_mcp, readme_kanbots_web, readme_kanbots_desktop [INFERRED 0.95]
- **Bundled web fonts redistributed under SIL OFL 1.1** — packages_web_src_assets_fonts_ofl_inter_tight, packages_web_src_assets_fonts_ofl_notosansmath_noto_sans_math, packages_web_src_assets_fonts_ofl_notosanssymbols_noto_sans_symbols, packages_web_src_assets_fonts_ofl_notosanssymbols2_noto_sans_symbols_2, packages_web_src_assets_fonts_ofl_notocoloremoji_noto_color_emoji, packages_web_src_assets_fonts_ofl_sil_open_font_license [EXTRACTED 1.00]
- **agentmemory integration decision set (ADR-0001..0005)** — docs_adr_0001_integration_vision_memory_and_cost_optimization_adr_0001, docs_adr_0002_agentmemory_server_lifecycle_adr_0002, docs_adr_0003_agentmemory_mcp_wiring_into_spawned_agents_adr_0003, docs_adr_0004_agentmemory_memory_scoping_multi_repo_adr_0004, docs_adr_0005_agentmemory_injection_and_checkpoint_flow_adr_0005, docs_adr_0001_integration_vision_memory_and_cost_optimization_agentmemory [EXTRACTED 1.00]
- **vagas.com.br end-to-end sync flow** — docs_specs_0001_vagas_ingestion_vagaspoller, docs_specs_0001_vagas_ingestion_vagasclient, docs_specs_0001_vagas_ingestion_vagas_config_table, docs_specs_0001_vagas_ingestion_vagas_imports_table, packages_core_src_issue_source_issuesource, docs_specs_0001_vagas_ingestion_inbox_column [EXTRACTED 1.00]
- **Cost-optimization axis (cost budgets, RTK, cost-aware recall)** — docs_adr_0001_integration_vision_memory_and_cost_optimization_cost_budgets, docs_adr_0006_rtk_cli_output_compression_rtk, docs_adr_0006_rtk_cli_output_compression_assumeinstalled_flag, docs_adr_0005_agentmemory_injection_and_checkpoint_flow_cost_aware_recall, docs_adr_0006_rtk_cli_output_compression_adr_0006 [INFERRED 0.85]
- **Agent CLIs implementing the AgentCliAdapter contract** — docs_agents_claude_code, docs_agents_codex_cli, docs_agents_antigravity_cli, packages_dispatcher_src_adapters_types_agentcliadapter, packages_dispatcher_src_adapters_claude_code, packages_dispatcher_src_adapters_codex_cli [EXTRACTED 1.00]
- **Dispatch -> worktree -> stream -> decision -> promote flow** — docs_agents_agent_run, docs_agents_worktree_lifecycle, docs_agents_stream_events, docs_agents_decision_prompt, docs_agents_promotion, docs_agents_pre_push_hook [EXTRACTED 1.00]
- **MCP client -> kodra-mcp-server -> HTTP tool bridge -> in-process handlers** — docs_mcp_server_kodra_mcp_server, packages_api_src_tool_bridge, packages_api_src_bridge, docs_mcp_server_security, docs_architecture_process_model [EXTRACTED 1.00]
- **Kodra icon size set** — docs_assets_brand_kodra_icon_32_image, docs_assets_brand_kodra_icon_64_image, docs_assets_brand_kodra_icon_128_image, docs_assets_brand_kodra_icon_256_image, docs_assets_brand_kodra_icon_512_image, docs_assets_brand_kodra_icon_1024_image [EXTRACTED 1.00]

## Communities (246 total, 18 thin omitted)

### Community 0 - "API Bridge & Handler Types"
Cohesion: 0.03
Nodes (102): Electron process model (no HTTP for renderer), Dispatcher port 8474, Tool bridge security model, CreateSupervisorOptions, AutopilotManagerOpts, AgentRunEventPayload, BridgeChannels, ChannelArgs (+94 more)

### Community 1 - "Vendored Eruda DevTools"
Cohesion: 0.06
Nodes (98): args, binPath, { createHash }, desktopRoot, { dirname, join, resolve }, { existsSync, readFileSync, unlinkSync, writeFileSync }, marker, prebuildInstall (+90 more)

### Community 3 - "Chat & Workspace Handlers"
Cohesion: 0.07
Nodes (86): ChatPayload, ChatPostMessageResult, ChatSessionPayload, chatSessionToPayload(), subscribe(), getPreview(), startRunPreview(), diff() (+78 more)

### Community 4 - "Task Detail Modal & Issues"
Cohesion: 0.04
Nodes (57): AgentSessionSection(), AutopilotTab(), buildResultIndex(), buildResumeCommand(), DecisionInline(), DetailTab, EventRow(), fmtElapsed() (+49 more)

### Community 6 - "Desktop Main & Auth"
Cohesion: 0.05
Nodes (71): AMP_AUTH_PATH, AMP_CONFIG_DIR, AMP_SETTINGS_PATH, AmpLoginNotImplemented, cancelAmpLogin(), isAmpAuthenticated(), startAmpLogin(), cancelCcrLogin() (+63 more)

### Community 7 - "ADRs & Vagas Spec"
Cohesion: 0.06
Nodes (78): ADR-0000: Adopt ADR convention, Lightweight ADR convention, ADR status lifecycle (Proposed -> Accepted -> Deprecated | Superseded), MADR (Markdown Architectural Decision Records), Michael Nygard's ADR article, ADR-0001: Integration vision — memory + cost optimization, agentmemory (rohitg00/agentmemory) persistent memory server, Per-run/per-session USD cost budgets (runCostBudgetUsd, sessionCostBudgetUsd) (+70 more)

### Community 8 - "Prefs Store & Board Views"
Cohesion: 0.05
Nodes (62): HIDDEN_BACKLOG_CREATED_EVENT, BoardViewsModal(), BoardViewsModalProps, BoardView, BoardViewsAPI, BoardViewSortMode, BoardViewState, boardViewStateEqual() (+54 more)

### Community 9 - "LLM Slash Commands & Catalogue"
Cohesion: 0.08
Nodes (55): acpAdapter, agyCliAdapter, ampCliAdapter, ccrCliAdapter, claudeCodeAdapter, codexCliAdapter, copilotCliAdapter, cursorCliAdapter (+47 more)

### Community 10 - "Issue & Agent Action Handlers"
Cohesion: 0.05
Nodes (69): DispatchResult, IssueActiveRunPayload, IssueDetail, PostMessageResult, SentryMetaPayload, SplitResult, ThreadPayload, approve() (+61 more)

### Community 11 - "SQLite Migrations"
Cohesion: 0.09
Nodes (34): migration, migration, migration, migration, migration, migration, migration, migration (+26 more)

### Community 12 - "Cloud Client"
Cohesion: 0.05
Nodes (43): buildUrl(), bypassHeaders(), CloudClientError, CloudClientOptions, request(), RequestInput, bodyToFormData(), CloudClient (+35 more)

### Community 13 - "Workspace Config & Store"
Cohesion: 0.06
Nodes (47): openStore(), openStoreInMemory(), OpenStoreOptions, PACKAGE_NAME, Store, migrations, runMigrations(), CHECK_KINDS (+39 more)

### Community 14 - "Board, Cards & Labels"
Cohesion: 0.06
Nodes (50): Card, CardBody(), cardDragId(), CardImpl(), CardPreview(), CardProps, CardSelectModifiers, stateClassFor() (+42 more)

### Community 15 - "Chat App & Run Streams"
Cohesion: 0.05
Nodes (48): AgentSpinner(), AgentSpinnerProps, formatElapsed(), formatNumber(), FRAMES, parseStart(), AgentRunReplayPayload, AgentRunStreamPayload (+40 more)

### Community 16 - "Agent Runs & Ship Handlers"
Cohesion: 0.07
Nodes (55): DiffFile, DiffFileStatus, DiffPayload, DraftedPrDescription, ForkRunResult, PromoteCommitResult, PromotePrResult, RunStatsResult (+47 more)

### Community 17 - "Subscription Cost Fetchers"
Cohesion: 0.09
Nodes (50): AgentUsageResult, CostTodayResult, agyPost(), antigravityExpiryMs(), AntigravityKeyringReader, AntigravityToken, breakdown(), cached() (+42 more)

### Community 18 - "Task Detail Actions & Sentry Modal"
Cohesion: 0.05
Nodes (34): DecisionActions(), dismiss(), pick(), ReviewActions(), handleShipped(), requestChanges(), spawnReviewer(), ArchiveModal() (+26 more)

### Community 19 - "Core Issue Source & Mappers"
Cohesion: 0.09
Nodes (25): Monorepo package layout and dependency graph, CachedPayload, IssueSource, RawAssignee, RawComment, rawCommentToComment(), RawIssue, rawIssueToIssue() (+17 more)

### Community 20 - "Local Store DB & Repos"
Cohesion: 0.06
Nodes (22): applyPragmas(), Db, openDb(), OwnWriteRevisions, trackDb(), writeRevisions, WriteTrackingState, CreateFolderInput (+14 more)

### Community 21 - "Dispatcher Package Manifest"
Cohesion: 0.04
Nodes (47): author, bugs, dependencies, @kanbots/core, zod, description, devDependencies, tsup (+39 more)

### Community 22 - "Core Package Manifest"
Cohesion: 0.04
Nodes (46): author, bugs, dependencies, @octokit/core, @octokit/plugin-paginate-rest, @octokit/request-error, description, devDependencies (+38 more)

### Community 23 - "Web API Client & Cloud Adapter"
Cohesion: 0.06
Nodes (34): BridgeError, CloudCtx, CostUsageResult, DismissCardResult, DispatchIssueInput, DispatchIssueResult, invoke(), PostMessageOptions (+26 more)

### Community 24 - "MCP Package Manifest"
Cohesion: 0.04
Nodes (44): @modelcontextprotocol/sdk, author, bin, kanbots-mcp-server, kodra-mcp-server, bugs, dependencies, @modelcontextprotocol/sdk (+36 more)

### Community 25 - "Local Store Package Manifest"
Cohesion: 0.04
Nodes (44): author, bugs, dependencies, better-sqlite3, @kanbots/core, description, devDependencies, tsup (+36 more)

### Community 26 - "Root Package Manifest"
Cohesion: 0.05
Nodes (43): eslint, @eslint/js, eslint-plugin-react-hooks, globals, author, description, devDependencies, eslint (+35 more)

### Community 27 - "Stream Parser"
Cohesion: 0.07
Nodes (37): AssistantContent, AssistantContentText, AssistantContentThinking, AssistantContentToolUse, buildRateLimitHaystack(), createDecisionStreamFilter(), drain(), DecisionPayload (+29 more)

### Community 28 - "LLM Package Manifest"
Cohesion: 0.05
Nodes (41): author, bugs, dependencies, @kanbots/dispatcher, @kanbots/local-store, description, devDependencies, tsup (+33 more)

### Community 29 - "Cloud Settings & Worktrees Rail"
Cohesion: 0.07
Nodes (31): CloudSettingsModal(), clearPoll(), handleBindRepo(), handleCancelSignIn(), handleClearBinding(), handleSignIn(), handleSignOut(), shortenPath() (+23 more)

### Community 30 - "Web Package Manifest"
Cohesion: 0.05
Nodes (40): @dnd-kit/core, dependencies, @dnd-kit/core, @kanbots/core, react, react-dom, react-virtuoso, zustand (+32 more)

### Community 31 - "Workspace Bootstrap Handlers"
Cohesion: 0.06
Nodes (38): Workspace, WorkspaceBudgets, WorkspaceFolderPayload, WorkspaceHouseRules, WorkspaceRepoPayload, WorkspaceRepoStatus, AddFolderArgs, addFolderSchema (+30 more)

### Community 32 - "Cards & Review Comments Repos"
Cohesion: 0.10
Nodes (18): CardAlreadyResolvedError, CardRow, CardsRepo, CreateCardInput, rowToCard(), AddReviewCommentInput, ListReviewCommentsForFileInput, ListReviewCommentsInput (+10 more)

### Community 33 - "Composer & Drafting"
Cohesion: 0.08
Nodes (37): AGENT_CLI_ADAPTERS, BacklogEntry, buildSuggestSystemPrompt(), claudeResultSchema, ComposerError, CreateComposerOptions, createPrDescriptionDrafter(), CreatePrDescriptionDrafterOptions (+29 more)

### Community 34 - "Task Create & Split Modals"
Cohesion: 0.06
Nodes (25): isCloudMode(), DraftSubtask, SplitModal(), onTitleKey(), submit(), SplitModalProps, Assignee, Effort (+17 more)

### Community 35 - "Workspace Tree Rail"
Cohesion: 0.07
Nodes (31): ancestorDirsForKeys(), badgeChar(), buildTouchedMap(), ChildrenCache, computeMatchedPaths(), countTouchedDescendants(), Entry, EntryType (+23 more)

### Community 36 - "Agent Run Supervisor Core"
Cohesion: 0.13
Nodes (27): applyKanbotsCommand(), createSupervisor(), applyAcpWorkspaceCommand(), collectLearningsForRun(), composeSystemPrompt(), findActiveRunForThread(), flushAllPendingEvents(), flushPendingEvents() (+19 more)

### Community 37 - "Desktop IPC Registration"
Cohesion: 0.09
Nodes (28): CREDENTIALS_PATH, CARD_STATUS_TO_ENTRY_STATUS, cardsToBacklogEntries(), registerCloudComposerHandlers(), RegisterCloudComposerOptions, SuggestArgs, IpcError, toIpcError() (+20 more)

### Community 38 - "Desktop Bridge Adapter"
Cohesion: 0.10
Nodes (23): AppProps, CLOUD_FEATURES_ENABLED, ActiveCloudWorkspaceInfo, ActiveWorkspaceInfo, BootstrapPayload, CloudLoginPollResult, CloudLoginStartResult, RecentCloudWorkspace (+15 more)

### Community 39 - "Autopilot Launch & Personas"
Cohesion: 0.09
Nodes (25): AutopilotLaunchModal(), refreshPersonas(), AutopilotLaunchModalProps, Effort, Parallelism, PARALLELISM_OPTIONS, Tab, ALL_PROVIDERS (+17 more)

### Community 40 - "Stats & Run Summary"
Cohesion: 0.09
Nodes (29): CheckCommandsMap, CheckPill(), fmtCmd(), fmtCost(), fmtDuration(), fmtElapsed(), fmtTokens(), RunSummary() (+21 more)

### Community 41 - "Desktop Dev Dependencies"
Cohesion: 0.06
Nodes (35): concurrently, dotenv-cli, electron, electron-builder, electronmon, @kanbots/mcp, @kanbots/web, devDependencies (+27 more)

### Community 42 - "Supervisor Orphan Reaping"
Cohesion: 0.07
Nodes (29): describeReapOutcome(), isAlive(), ReapOptions, reapOrphanProcess(), ReapOutcome, ACTIVE_STATUSES, ActiveRun, AgentEventListener (+21 more)

### Community 43 - "Dispatcher Worker & Checks"
Cohesion: 0.10
Nodes (27): setAcpWorkspaceCommand(), AgentRunProvider, CheckCommand, CheckCommandOverride, CheckCommandOverrides, CheckKind, CheckResult, CheckStatus (+19 more)

### Community 44 - "Agent Runs Repo"
Cohesion: 0.13
Nodes (12): AgentRunRow, AgentRunsRepo, CreateAgentRunInput, PATCH_COLUMNS, rowToAgentRun(), UpdateAgentRunPatch, AgentRun, AgentRunStatus (+4 more)

### Community 45 - "Chat Sessions Repos"
Cohesion: 0.11
Nodes (14): CHAT_REPO_NAME, CHAT_REPO_OWNER, ChatConversationRow, ChatConversationsRepo, CreateChatConversationInput, rowTo(), ChatSessionRow, ChatSessionsRepo (+6 more)

### Community 46 - "Issue Relations & Autopilot Handlers"
Cohesion: 0.08
Nodes (31): IssueRelationPayload, checkCommandSchema, effortSchema, featureDevConfigSchema, getByIssue(), GetByIssueArgs, getByIssueSchema, listActive() (+23 more)

### Community 47 - "Sentry Poller"
Cohesion: 0.10
Nodes (23): broadcastIssueChange(), buildSource(), ensureLocalWorkspace(), execFileAsync, findWebContentsForOwner(), maybeNotifyRunStatus(), notificationBody(), openWorkspaceInternal() (+15 more)

### Community 48 - "Preview Proxy"
Cohesion: 0.10
Nodes (31): isPortFree(), pickPort(), PreviewHandle, PreviewSpawnOptions, PreviewState, ASSET_CACHE, buildAssetCandidates(), detectModuleDir() (+23 more)

### Community 49 - "Local Issues Source"
Cohesion: 0.10
Nodes (15): LocalIssueSource, LocalIssueSourceOptions, bindIssueRef(), CommentRow, CreateLocalCommentInput, CreateLocalIssueInput, DuplicateIssueNumberError, InvalidIssueIdError (+7 more)

### Community 50 - "Board Agent Streams & Column"
Cohesion: 0.10
Nodes (30): cardLiveTool(), cardLiveToolCache, Column(), columnDropId(), ColumnProps, formatActivity(), LiveState, SuggestActivity (+22 more)

### Community 51 - "Sentry Curator"
Cohesion: 0.10
Nodes (19): claudeResultSchema, createCurator(), CreateCuratorOptions, CuratorError, CuratorOutcome, curatorOutputSchema, runClaudeJsonSchema(), RunClaudeOpts (+11 more)

### Community 52 - "Sentry Client"
Cohesion: 0.10
Nodes (24): ListIssuesOptions, parseNextCursor(), RawBreadcrumb, RawExceptionValue, RawSentryEvent, RawSentryIssue, RawStackFrame, rawToBreadcrumb() (+16 more)

### Community 53 - "Preview Proxy Benchmark"
Cohesion: 0.10
Nodes (32): agent, BURST_CONCURRENCY, BURST_SECONDS, fmt(), fmtMb(), HERE, LARGE_BODY, LatencyStats (+24 more)

### Community 54 - "Autopilot Sessions Repo"
Cohesion: 0.11
Nodes (23): AutopilotSessionRow, AutopilotSessionsRepo, CreateAutopilotSessionInput, PATCH_COLUMNS, rowToSession(), UpdateAutopilotSessionPatch, AutopilotCheckCommand, AutopilotChildEntry (+15 more)

### Community 55 - "Desktop Updater & Types"
Cohesion: 0.10
Nodes (28): api, ActiveWorkspaceInfo, BootstrapPayload, CloudLoginPollResult, CloudLoginStartResult, CloudStatusPayload, RecentCloudWorkspace, RecentWorkspace (+20 more)

### Community 56 - "CLI Package"
Cohesion: 0.07
Nodes (28): commander, bin, kanbots, dependencies, commander, devDependencies, tsup, @types/node (+20 more)

### Community 57 - "PR Modal & Model Picker"
Cohesion: 0.07
Nodes (19): api, AGENT_RUN_PROVIDERS, ModelEntry, ModelPicker(), ModelPickerProps, ModelPickerValue, MODELS, PROVIDER_LABELS (+11 more)

### Community 58 - "Cloud Auth"
Cohesion: 0.11
Nodes (28): Device Authorization Grant login flow (RFC 8628), bypassHeader(), cancelCloudLogin(), clearCloudAuth(), CloudAuthRequiredError, CloudConfigFile, CloudConfigFileV1, CloudConfigPromptOnly (+20 more)

### Community 59 - "Autopilot Orchestrator Loops"
Cohesion: 0.11
Nodes (24): buildSuggestionContext(), clampParallelism(), doClaim(), log(), PersonaClaim, runFeatureDevLoop(), runOneIteration(), runSlot() (+16 more)

### Community 60 - "Handler Test Kit"
Cohesion: 0.13
Nodes (10): SubscriptionRegistry, execFileAsync, tempDirs, makeChatSession(), makeStubSupervisor(), issueFixture(), FakeRegistry, HandlerTestKit (+2 more)

### Community 61 - "Board Page & Selection"
Cohesion: 0.09
Nodes (24): CardSelectionAPI, sameIssue(), useCardSelection(), ActiveSub, CloudBoardEntry, CloudRunEventMessage, summarize(), useCloudBoardStreams() (+16 more)

### Community 62 - "Provider Handlers"
Cohesion: 0.12
Nodes (28): ProviderSaveInput, ProviderSettingsInput, ProvidersPayload, ProviderTestConnectionResult, createProvidersHandlers(), apiKeyHintFor(), claudeCodeCredentialsPath(), detectProviderCredentials() (+20 more)

### Community 63 - "Markdown Editor & Renderer"
Cohesion: 0.12
Nodes (21): LineOpts, MarkdownEditor, MarkdownEditorHandle, MarkdownEditorProps, ToolbarBtnProps, WrapOpts, isNewerOrEqual(), isUpdaterState() (+13 more)

### Community 64 - "npx CLI Manifest"
Cohesion: 0.07
Nodes (27): bin, kanbots, bugs, url, description, engines, node, files (+19 more)

### Community 65 - "Core GitHub Tests"
Cohesion: 0.12
Nodes (12): CacheEntry, ETagCache, SetCacheInput, GitHubClientOptions, MemoryCache, FakeFetch, FakeRequest, FakeResponseInit (+4 more)

### Community 66 - "Providers Repo"
Cohesion: 0.12
Nodes (16): getOwnWriteRevisions(), wrap(), PATCH_COLUMNS, PROVIDER_IDS, ProviderConfigPatch, ProviderConfigRow, ProviderSettingsPatch, ProviderSettingsRepo (+8 more)

### Community 67 - "Inline Diff Viewer"
Cohesion: 0.10
Nodes (24): buildDiffRows(), CommentCard(), CommentCardProps, commentKey(), CommentListProps, CommentTriggerProps, DiffOp, DiffRow (+16 more)

### Community 68 - "Adapter Registry & ACP"
Cohesion: 0.19
Nodes (15): acpAdapter, DEFAULT_ACP_ARGS, parseShellLikeCommand(), resolveAcpInvocation(), ampCliAdapter, ccrCliAdapter, claudeCodeAdapter, codexCliAdapter (+7 more)

### Community 69 - "Learnings Repo"
Cohesion: 0.16
Nodes (13): hashLearningContent(), LearningRow, LearningsRepo, ListAllLearningsInput, ListForInjectionInput, normaliseLearningContent(), rowToLearning(), UpsertLearningInput (+5 more)

### Community 70 - "Messages & Promotions Repos"
Cohesion: 0.14
Nodes (14): CreateMessageInput, MessageRow, MessagesRepo, rowToMessage(), CreatePromotionInput, PromotionRow, PromotionsRepo, rowToPromotion() (+6 more)

### Community 71 - "Cloud Client Manifest"
Cohesion: 0.08
Nodes (25): author, description, devDependencies, tsup, @types/node, typescript, vitest, exports (+17 more)

### Community 72 - "Workspace Tree IPC"
Cohesion: 0.14
Nodes (23): cachedWorktreeEnumeration(), cachedWorktreeSweep(), execAsync, execFileAsync, HIDDEN_EXCLUDES, invalidateWorktreeCache(), normaliseStatus(), parseWorktreeList() (+15 more)

### Community 73 - "File Change Viewer"
Cohesion: 0.10
Nodes (23): buildPrompt(), buildRestartContext(), deriveTitle(), DiffPayload, DiffViewState, FileChangeViewer(), FileChangeViewerProps, FileContentView() (+15 more)

### Community 74 - "npx Postinstall"
Cohesion: 0.15
Nodes (24): alreadyInstalled(), clearQuarantine(), downloadToFile(), ensureDir(), fs, getAssetName(), getPlatformKey(), https (+16 more)

### Community 75 - "Core Labels & Issue Refs"
Cohesion: 0.17
Nodes (18): parseGitHubRemoteUrl(), PACKAGE_NAME, issueBranchSlug(), isValidCustomIssueId(), parseIssueRef(), AGENT_LABELS, AGENT_PREFIX, agentFromLabels() (+10 more)

### Community 76 - "Card Templates Settings Modal"
Cohesion: 0.09
Nodes (14): CardTemplatesSettingsModal(), commitReorder(), handleSave(), onDrop(), startEdit(), CardTemplatesSettingsModalProps, Draft, EMPTY_DRAFT (+6 more)

### Community 77 - "Providers Settings Modal"
Cohesion: 0.10
Nodes (17): AcpCommandPanel(), handleSave(), BridgeLoginResult, cancelLoginForProvider(), LoginState, MODELS_BY_PROVIDER, ProviderSection(), handleCancelSignIn() (+9 more)

### Community 78 - "Card Templates Handlers"
Cohesion: 0.14
Nodes (22): CardTemplatePayload, DecoratedIssue, create(), CreateCardTemplateArgs, createSchema, DeleteCardTemplateArgs, deleteSchema, instantiate() (+14 more)

### Community 79 - "Bridge Package Manifest"
Cohesion: 0.09
Nodes (22): devDependencies, tsup, @types/node, typescript, vitest, exports, files, dist (+14 more)

### Community 80 - "Codex CLI Adapter"
Cohesion: 0.11
Nodes (22): AgentMessageDetails, CodexErrorPayload, CodexEvent, CodexThreadErrorEvent, CodexUsage, CommandExecutionDetails, extractTextWithDecisions(), FileChangeDetails (+14 more)

### Community 81 - "Worktree & Identity"
Cohesion: 0.15
Nodes (19): createWorktree(), CreateWorktreeInput, defaultBranchName(), defaultWorktreePath(), execFileAsync, hardenWorktree(), detectExternalHooksPath(), execFileAsync (+11 more)

### Community 82 - "Base TSConfig"
Cohesion: 0.09
Nodes (22): compilerOptions, allowSyntheticDefaultImports, declaration, declarationMap, esModuleInterop, exactOptionalPropertyTypes, forceConsistentCasingInFileNames, isolatedModules (+14 more)

### Community 83 - "Kodra Brand Assets"
Cohesion: 0.11
Nodes (22): Kodra icon 1024px, Kodra icon 128px, Kodra icon 256px, Kodra icon 32px, Kodra icon 512px, Kodra icon 64px, Kodra icon master (SVG source), Kodra icon (+14 more)

### Community 84 - "Fake Issue Source & Reconcile"
Cohesion: 0.10
Nodes (4): reconcileIssueLabels(), ReconcileLabelsResult, ApiError, FakeIssueSource

### Community 86 - "Autopilot Manager"
Cohesion: 0.14
Nodes (14): createAutopilotManager(), getSession(), getSessionByIssue(), listActive(), notify(), readDefaultSessionBudget(), resolveSessionBudget(), runLoop() (+6 more)

### Community 87 - "Analytics Handlers"
Cohesion: 0.10
Nodes (20): RecentActivityKind, RecentActivityPayload, buildRollupOpts(), classifyEvent(), CostTimeSeriesPoint, frontier(), FrontierArgs, FrontierPoint (+12 more)

### Community 88 - "AgentMemory Client"
Cohesion: 0.13
Nodes (17): createAgentMemoryClient(), ENDPOINTS, failureMessage(), isRecord(), JsonParser, MemoryClientConfig, memorySessionId(), ObserveInput (+9 more)

### Community 89 - "Electron Builder Config"
Cohesion: 0.10
Nodes (20): build, appId, asar, asarUnpack, beforePack, directories, executableName, files (+12 more)

### Community 90 - "Diff Hunks Repo"
Cohesion: 0.21
Nodes (10): AppendDiffHunkInput, DiffHunkRow, DiffHunksRepo, makeSnapshotId(), rowToHunk(), AgentEventId, DiffHunk, DiffHunkId (+2 more)

### Community 91 - "App Shell & Routing"
Cohesion: 0.12
Nodes (11): describeFolder(), ShellHost(), isTypingTarget(), ShortcutHandlers, useGlobalShortcuts(), onKey(), navigate(), parseHash() (+3 more)

### Community 92 - "Attachments & Cards Handlers"
Cohesion: 0.13
Nodes (16): DismissCardResult, ResolveCardResult, UploadAttachmentResult, attachmentsDir(), MIME_EXT, upload(), UploadArgs, uploadSchema (+8 more)

### Community 93 - "Workspace Repos Settings Modal"
Cohesion: 0.13
Nodes (12): getCloudCtx(), AddDraft, EMPTY_ADD_DRAFT, RepoCard(), RepoCardProps, WorkspaceReposSettingsModal(), handlePickFolder(), handleRenameRepo() (+4 more)

### Community 94 - "Sentry Handlers"
Cohesion: 0.14
Nodes (17): SentryAnalyzerInput, SentryConfigInput, SentryConfigPayload, SentrySyncResult, SentryTestConnectionResult, applySuggestion(), buildAnalyzerInput(), frameToInput() (+9 more)

### Community 95 - "Memory Flow Tests"
Cohesion: 0.12
Nodes (6): MemoryHit, AgentMemorySessionBridge, buildSupervisor(), enabledConfig, makeHandle(), TestHandle

### Community 96 - "Desktop Build Scripts"
Cohesion: 0.11
Nodes (18): scripts, build, build:deps, build:main, build:web, copy:web, dev, ensure:native (+10 more)

### Community 97 - "Claude Auth"
Cohesion: 0.18
Nodes (16): base64url(), cancelClaudeLogin(), ClaudeLoginError, ClaudeLoginResult, endPending(), exchangeCode(), handleCallback(), isClaudeAuthenticated() (+8 more)

### Community 98 - "Agent Events Repo"
Cohesion: 0.23
Nodes (8): withEventWriteScope(), AgentEventRow, AgentEventsRepo, AppendAgentEventInput, ListAgentEventsOptions, rowToAgentEvent(), AgentEvent, AgentEventType

### Community 99 - "MCP Server & Auth"
Cohesion: 0.18
Nodes (13): CLOUD_SIGNIN_HINT, CloudAuthRequiredError, CloudSession, MinimalCloudConfig, readCloudSession(), requireCloudSession(), userDataDir(), ISSUE_REF_SCHEMA (+5 more)

### Community 100 - "Web TSConfig"
Cohesion: 0.11
Nodes (17): compilerOptions, jsx, lib, noEmit, types, exclude, extends, include (+9 more)

### Community 101 - "Memory Session Bridge"
Cohesion: 0.24
Nodes (15): createAgentMemorySessionBridge(), drain(), endSession(), enqueue(), observe(), run(), scheduleDrain(), startSession() (+7 more)

### Community 102 - "Cloud Run Dispatcher"
Cohesion: 0.18
Nodes (15): branchNameFor(), BufferedEvent, CloudRunHandle, CloudRunSummary, DispatchCloudRunOptions, PROVIDER_TO_CLI, PROVIDER_TO_PROVIDER_TAG, startCloudRun() (+7 more)

### Community 103 - "IPC Subscriptions"
Cohesion: 0.20
Nodes (15): ACTIVE_STATUSES, createSubscriptionRegistry(), clearReadyTimer(), closeAllForOwner(), drainPending(), emit(), finalize(), ready() (+7 more)

### Community 104 - "Cursor CLI Adapter"
Cohesion: 0.14
Nodes (14): CursorAssistantEvent, cursorCliAdapter, CursorContentItem, CursorEvent, CursorMessage, CursorResultEvent, CursorSystemEvent, CursorThinkingEvent (+6 more)

### Community 105 - "Dispatcher Test Helpers"
Cohesion: 0.15
Nodes (11): createComposer(), buildClaudeJsonOutput(), FakeSpawn, FakeSpawnCall, FakeSpawnOptions, makeFakeSpawn(), BACKLOG, ASSISTANT_TEXT (+3 more)

### Community 106 - "Chat Session Dropdown"
Cohesion: 0.12
Nodes (8): PROVIDER_LABELS, SessionCreateInput, SessionCreatorPopover(), SessionDropdown(), SessionDropdownProps, sessionLabel(), STATUS_DOT_CLASS, useActiveSessionId()

### Community 107 - "Tool Use Cards"
Cohesion: 0.18
Nodes (12): asString(), describeToolUse(), getDisplayPath(), getToolUseInputForBody(), ToolHeader, ToolInput, truncateArg(), extractResultText() (+4 more)

### Community 108 - "API Package Manifest"
Cohesion: 0.12
Nodes (15): author, bugs, description, exports, files, homepage, dist, license (+7 more)

### Community 109 - "Composer Suggestions"
Cohesion: 0.17
Nodes (14): DraftedIssue, SuggestFeatureBacklogEntry, SuggestFeatureEntryStatus, draft(), DraftArgs, draftSchema, suggest(), SuggestArgs (+6 more)

### Community 110 - "Provider Credentials"
Cohesion: 0.32
Nodes (14): hasAcpCredentials(), hasAgyCliCredentials(), hasAmpCliCredentials(), hasCcrCliCredentials(), hasCodexCliCredentials(), hasCopilotCliCredentials(), hasCursorCliCredentials(), hasDroidCliCredentials() (+6 more)

### Community 111 - "Instance Lock"
Cohesion: 0.18
Nodes (9): acquireInstanceLock(), AllPortsBusyError, BoundPort, InstanceLockHandle, InstanceLockHooks, InstanceLockOptions, LockFileBody, lockfilePath() (+1 more)

### Community 112 - "Desktop TSConfig"
Cohesion: 0.12
Nodes (15): compilerOptions, module, moduleResolution, outDir, rootDir, types, verbatimModuleSyntax, exclude (+7 more)

### Community 113 - "Preview Inspect Script"
Cohesion: 0.26
Nodes (15): buildSelector(), cssEscape(), describe(), ensureOverlay(), onClick(), onKeyDown(), onMouseMove(), onMouseOut() (+7 more)

### Community 114 - "ACP Protocol"
Cohesion: 0.14
Nodes (15): AgentMessageChunkUpdate, AgentThoughtChunkUpdate, ContentBlock, ContentBlockImage, ContentBlockText, contentText(), JsonRpcMessage, mapSessionUpdate() (+7 more)

### Community 115 - "Sentry Imports Repo"
Cohesion: 0.24
Nodes (8): parseSuggestion(), rowToImport(), SentryImportRow, SentryImportsRepo, UpsertSentryImportInput, SentryImport, SentryImportStatus, SentrySuggestion

### Community 116 - "Replay Buffer"
Cohesion: 0.16
Nodes (6): ReplayBuffer, ReplayBufferOptions, ReplayDelivery, ReplayEntry, sizeOf(), toDelivery()

### Community 117 - "Cloud Client TSConfig"
Cohesion: 0.13
Nodes (14): compilerOptions, lib, noEmit, exclude, extends, include, dist, DOM (+6 more)

### Community 118 - "Core Auth & Errors"
Cohesion: 0.21
Nodes (8): AuthDeps, defaultRunGhCli(), execFileAsync, resolveGitHubToken(), TOKEN_FILE_PATH, GitHubRequestError, KanbotsAuthError, KanbotsError

### Community 119 - "Cloud Bindings"
Cohesion: 0.24
Nodes (14): bindingsPath(), clearCloudProjectBinding(), CloudProjectBinding, CloudProjectBindingsFile, getCloudProjectBinding(), key(), readFileSafe(), setCloudProjectBinding() (+6 more)

### Community 120 - "Sentry Analyzer"
Cohesion: 0.17
Nodes (14): SpawnFn, claudeResultSchema, createSentryAnalyzer(), CreateSentryAnalyzerOptions, formatSentryPrompt(), runClaudeForSentrySuggestion(), RunClaudeOptions, SentryAnalyzerBreadcrumb (+6 more)

### Community 121 - "Issue Relations Repo"
Cohesion: 0.18
Nodes (5): AddIssueRelationInput, IssueRelation, IssueRelationRow, IssueRelationsRepo, rowToRelation()

### Community 122 - "Workspace Repos Repo"
Cohesion: 0.18
Nodes (5): AddWorkspaceRepoInput, rowToRepo(), WorkspaceRepo, WorkspaceRepoRow, WorkspaceReposRepo

### Community 123 - "Preview Panel"
Cohesion: 0.15
Nodes (7): DeviceMode, PreviewInspectSelection, PreviewPanel(), postToFrame(), toggleDevtools(), toggleInspect(), PreviewPanelProps

### Community 124 - "npx Launcher"
Cohesion: 0.20
Nodes (13): fs, getPlatformKey(), main(), os, path, POSTINSTALL, printMissingBinary(), printUnsupported() (+5 more)

### Community 125 - "Supervisor Handle Wiring"
Cohesion: 0.23
Nodes (14): applyRateLimit(), clearCooldownOnSuccess(), emitCooldown(), ensureAgentMessage(), handleContainmentEscape(), invokeRunCleanup(), nextLiveEventSeq(), notifyDecisionChange() (+6 more)

### Community 126 - "Review Comments Handlers"
Cohesion: 0.23
Nodes (13): ReviewCommentPayload, add(), addSchema, consumePending(), consumeSchema, list(), listForFile(), listForFileSchema (+5 more)

### Community 127 - "Agent Checks Handlers"
Cohesion: 0.18
Nodes (13): commands(), finishCheck(), inFlight, list(), ListChecksArgs, listSchema, loadCheckOverrides(), ResolvedCheckCommands (+5 more)

### Community 128 - "Agent Checks Repo"
Cohesion: 0.24
Nodes (8): AgentCheckRow, AgentChecksRepo, FinishCheckInput, rowToCheck(), StartCheckInput, AgentCheck, CheckKind, CheckStatus

### Community 129 - "Card Templates Repo"
Cohesion: 0.19
Nodes (6): CardTemplate, CardTemplateRow, CardTemplatesRepo, CreateCardTemplateInput, rowToTemplate(), UpdateCardTemplatePatch

### Community 130 - "Repo Scripts Settings Modal"
Cohesion: 0.14
Nodes (6): EMPTY, RepoScriptsSettingsModal(), RepoScriptsSettingsModalProps, RunOutput, ScriptDraft, ScriptFieldProps

### Community 131 - "Desktop Dependencies"
Cohesion: 0.15
Nodes (13): electron-updater, dependencies, better-sqlite3, electron-updater, @octokit/core, @octokit/plugin-paginate-rest, @octokit/request-error, zod (+5 more)

### Community 132 - "API TSConfig"
Cohesion: 0.15
Nodes (12): compilerOptions, noEmit, exclude, extends, include, dist, node_modules, src/**/* (+4 more)

### Community 133 - "GitHub Client"
Cohesion: 0.19
Nodes (4): GitHubClient, isRequestError(), Octokit, Repo

### Community 134 - "Core TSConfig"
Cohesion: 0.15
Nodes (12): compilerOptions, noEmit, exclude, extends, include, dist, node_modules, src/**/* (+4 more)

### Community 135 - "Containment Scanner"
Cohesion: 0.27
Nodes (12): collectFilePathsFromInput(), ContainmentEscape, extractBashCommand(), FILE_TOOLS, inspectToolUse(), InspectToolUseInput, InspectToolUseResult, isObject() (+4 more)

### Community 136 - "Sentry Config Repo"
Cohesion: 0.28
Nodes (7): PATCH_COLUMNS, rowToConfig(), SentryConfigPatch, SentryConfigRepo, SentryConfigRow, SentryConfig, SentryTokenEncryption

### Community 137 - "Threads Repo"
Cohesion: 0.28
Nodes (5): CreateThreadInput, rowToThread(), ThreadRow, ThreadsRepo, Thread

### Community 138 - "Local Store TSConfig"
Cohesion: 0.15
Nodes (12): compilerOptions, noEmit, exclude, extends, include, dist, node_modules, src/**/* (+4 more)

### Community 139 - "Agent Usage Row"
Cohesion: 0.24
Nodes (11): AgentUsageResult, UsageWindowInfo, AgentCluster(), AgentUsageRowProps, formatResetCountdown(), fullLabel(), nameTitle(), PLACEHOLDER_WINDOWS (+3 more)

### Community 140 - "Release Workflow"
Cohesion: 0.24
Nodes (12): CI Workflow, CI verify job (build, typecheck, lint, format, test), Release build matrix job (mac/win/linux), Release bump job (version bump, commit, tag), electron-builder publish, Prepare-release job (create GitHub release once), Release Workflow, pnpm workspace (packages/*) (+4 more)

### Community 141 - "RTK & Configuration Docs"
Cohesion: 0.21
Nodes (12): ADR-0001 Integration vision: memory and cost optimization, ADR-0003 AgentMemory MCP wiring, ADR-0006 RTK CLI output compression, Autopilot orchestrator, Cost budgets (runCostBudgetUsd / sessionCostBudgetUsd), Autopilot qa mode, Check command overrides (typecheck/tests/lint/e2e), memory config section (AgentMemory) (+4 more)

### Community 142 - "Agent Docs Concepts"
Cohesion: 0.24
Nodes (12): Agent run, bypassPermissions hands-off mode, Containment mode (off/warn/pause), Decision prompt / DecisionPayload, Worktree pre-push hook, Promotion (promote commit / draft PR / discard), Worktree lifecycle, kodra-decision fenced block protocol (+4 more)

### Community 143 - "Provider & Issue Docs"
Cohesion: 0.23
Nodes (12): Antigravity CLI (agy -p), Codex CLI (codex exec), Renderer (@kanbots/web React+Vite), SQLite database and numbered migrations, codex-cli provider id, Workspace picker and .kanbots/ layout, GitHub issue mode, Sentry import and analysis (+4 more)

### Community 144 - "Bridge TSConfig"
Cohesion: 0.17
Nodes (11): compilerOptions, noEmit, exclude, extends, include, dist, node_modules, src/**/* (+3 more)

### Community 145 - "CLI TSConfig"
Cohesion: 0.17
Nodes (11): compilerOptions, noEmit, exclude, extends, include, dist, node_modules, src/**/* (+3 more)

### Community 146 - "OpenCode CLI Adapter"
Cohesion: 0.24
Nodes (11): accum, extractTextWithDecisions(), getSessionId(), isRecord(), mapEvent(), OpencodeAccum, opencodeCliAdapter, OpencodeEvent (+3 more)

### Community 147 - "Board Filters"
Cohesion: 0.17
Nodes (7): BoardFiltersControls, BoardFiltersProps, BoardFiltersStats, BoardFiltersViewsAPI, BoardSortMode, SORT_LABEL, ViewsDropdown()

### Community 148 - "Bulk Action Bar"
Cohesion: 0.18
Nodes (7): BulkActionBarProps, BulkStatusTarget, LabelsDropdown(), onDoc(), STATUS_TARGETS, StatusDropdown(), STATUS_LABEL

### Community 149 - "Cloud First-Run Prompt"
Cohesion: 0.18
Nodes (7): CloudFirstRunPrompt(), dismiss(), CloudFirstRunPromptProps, CloudBinding, CloudSettingsModalProps, LoginState, CloudStatusPayload

### Community 150 - "Docs Index"
Cohesion: 0.25
Nodes (11): Agents (doc), Architecture (doc), Configuration (doc), Getting started (doc), Issues (doc), MCP server (doc), Kodra as rebranded fork of Kanbots, Rebranding migration debt (+3 more)

### Community 151 - "MCP Server Docs"
Cohesion: 0.27
Nodes (11): Claude Code CLI (claude -p), Autopilot feature-dev mode, Persona (system prompt snippet), Startup environment variables (KANBOTS_*), kodra-mcp-server (stdio MCP process), MCP tool set (issue CRUD + agent runs), Retained kanbots compatibility identifiers, Kodra Cloud (app.kanbots.dev remote workspaces) (+3 more)

### Community 152 - "API Dependencies"
Cohesion: 0.18
Nodes (11): @kanbots/llm, dependencies, @kanbots/core, @kanbots/dispatcher, @kanbots/llm, @kanbots/local-store, zod, @kanbots/core (+3 more)

### Community 153 - "Learnings Handlers"
Cohesion: 0.18
Nodes (10): DeleteLearningArgs, idSchema, list(), ListLearningsArgs, listSchema, PinLearningArgs, pinSchema, UpdateLearningArgs (+2 more)

### Community 154 - "Droid CLI Adapter"
Cohesion: 0.22
Nodes (10): droidCliAdapter, DroidEvent, DroidMessageEvent, DroidResultEvent, DroidSystemEvent, DroidToolCallEvent, DroidToolResultEvent, mapEvent() (+2 more)

### Community 155 - "Gemini CLI Adapter"
Cohesion: 0.20
Nodes (10): geminiCliAdapter, GeminiEvent, GeminiMessageEvent, GeminiResultEvent, GeminiSessionEvent, GeminiThoughtEvent, GeminiToolResultEvent, GeminiToolUseEvent (+2 more)

### Community 156 - "Qwen CLI Adapter"
Cohesion: 0.20
Nodes (10): mapEvent(), qwenCliAdapter, QwenEvent, QwenMessageEvent, QwenResultEvent, QwenSessionEvent, QwenThoughtEvent, QwenToolResultEvent (+2 more)

### Community 157 - "Dispatcher TSConfig"
Cohesion: 0.18
Nodes (10): compilerOptions, outDir, rootDir, exclude, extends, include, dist, node_modules (+2 more)

### Community 158 - "LLM TSConfig"
Cohesion: 0.18
Nodes (10): compilerOptions, outDir, rootDir, exclude, extends, include, dist, node_modules (+2 more)

### Community 159 - "MCP TSConfig"
Cohesion: 0.18
Nodes (10): compilerOptions, outDir, rootDir, exclude, extends, include, dist, node_modules (+2 more)

### Community 160 - "Memory Settings Modal"
Cohesion: 0.20
Nodes (7): invokeWorkspaceMemory(), MemorySettingsModal(), refreshStatus(), MemorySettingsModalProps, MemoryState, readMemoryStatus(), WorkspaceMemoryConfig

### Community 161 - "README Run Lifecycle"
Cohesion: 0.24
Nodes (11): Agent memory (workspace-scoped MCP memory server), Agent run lifecycle (dispatch -> worktree -> stream -> decision -> post-run actions), Fork run into existing worktree, @kanbots/dispatcher package, @kanbots/mcp package, kodra-mcp-server (board over MCP), Promote worktree (commit or draft PR), Sentry import (error groups onto board) (+3 more)

### Community 162 - "npx Launcher Docs"
Cohesion: 0.27
Nodes (10): macOS Gatekeeper quarantine clearing (xattr -rd), Launcher (bin/kanbots.js), Kanbots npx launcher (npx kanbots), postinstall script (scripts/postinstall.js), Windows manual install gap, Web app HTML entry (Vite index.html), Kanbots (upstream project), @kanbots/web package (React + Vite UI) (+2 more)

### Community 163 - "Agent CLI Slash Commands"
Cohesion: 0.24
Nodes (8): SlashCommandPayload, cache, CacheEntry, slashCommands(), SlashCommandsArgs, slashCommandsSchema, SUPPORTED_AGENTS, toPayload()

### Community 165 - "Desktop Package Meta"
Cohesion: 0.20
Nodes (9): description, electronmon, logLevel, patterns, main, name, private, version (+1 more)

### Community 166 - "DB Watcher"
Cohesion: 0.24
Nodes (8): DbWatcher, FileSig, watchDbFile(), changed(), snapshot(), tick(), WatchDbFileOptions, ActiveWorkspace

### Community 167 - "MCP Composition"
Cohesion: 0.31
Nodes (7): buildChatToolRuntime(), buildCodexMcpArgs(), tomlString(), agentMemoryMcpEntry(), McpServerEntry, withAgentMemory(), base

### Community 168 - "Persona Picker Screenshot"
Cohesion: 0.28
Nodes (9): Custom Persona Creation (New Persona, Stored Locally), Growth Lead Persona, Persona Roster (Predefined Perspectives), Pick a Perspective Dialog, Product Manager Persona, Reliability Engineer Persona, Persona Picker Screenshot, Senior Engineer Persona (+1 more)

### Community 169 - "API Dev Dependencies"
Cohesion: 0.22
Nodes (9): devDependencies, tsup, @types/node, typescript, vitest, tsup, @types/node, typescript (+1 more)

### Community 170 - "Chat Tools Dispatch"
Cohesion: 0.42
Nodes (7): dispatchChatTool(), expectIssueRef(), expectNumber(), expectString(), optionalBoolean(), optionalNumber(), optionalString()

### Community 171 - "Codex Auth"
Cohesion: 0.25
Nodes (7): cancelCodexLogin(), CODEX_AUTH_PATH, CodexLoginError, CodexLoginResult, isCodexAuthenticated(), PendingLogin, startCodexLogin()

### Community 172 - "Model Pricing"
Cohesion: 0.39
Nodes (7): computeCostUsd(), getModelPricing(), loadOverrides(), MODEL_PRICING, ModelPricing, _resetPricingOverridesForTest(), TokenUsage

### Community 173 - "Prettier Config"
Cohesion: 0.22
Nodes (8): arrowParens, endOfLine, printWidth, semi, singleQuote, tabWidth, trailingComma, useTabs

### Community 174 - "README Agent Features"
Cohesion: 0.22
Nodes (9): Agent Client Protocol (ACP) over stdio, Autopilot (dispatch loop), Branch preview (worktree dev server), feature-dev autopilot mode, @kanbots/api package, @kanbots/llm package, qa autopilot mode, Subscription / plan usage awareness (+1 more)

### Community 175 - "New Task Modal Screenshot"
Cohesion: 0.36
Nodes (8): Agent Assignee, CLI, Model and Effort Configuration, Auto-run Checks on Each Step (Typecheck, Unit tests, Lint, E2E, Branch preview), How It'll Appear Card Preview Panel, Markdown Description Editor with AC Template, Task Labels (Type and Priority), New Task Modal Screenshot, Task Start Mode (Spec first / Create & dispatch / Queue for later), Task Template Selector (Bug fix/Feature/Refactor/Review/Spike)

### Community 176 - "Copy Web Script"
Cohesion: 0.25
Nodes (7): { copyFileSync, cpSync, existsSync, mkdirSync, rmSync }, desktopRoot, iconSrc, iconTarget, { join, resolve }, target, webDist

### Community 177 - "Antigravity CLI Adapter"
Cohesion: 0.50
Nodes (7): agyCliAdapter, isRecord(), mapEvent(), mapResult(), mapStepUpdate(), tokenUsageFrom(), toolResultCandidates()

### Community 178 - "Web Test Bridge"
Cohesion: 0.25
Nodes (4): FakeBridge, FakeBridgeExtras, Handlers, InstallOptions

### Community 179 - "Agent CLI Picker Screenshot"
Cohesion: 0.48
Nodes (7): AI Providers Modal, Claude Code Subscription Section, Codex CLI (OpenAI) Provider Card, Configured Status Badge, Default Provider/Model Selectors, AI Providers Settings Screenshot, Sign in with Claude Code OAuth Flow

### Community 180 - "Autopilot Screenshot"
Cohesion: 0.43
Nodes (7): Refresh Personas / Backlog Suggest-Feature Flow, Feature Dev / QA Mode Tabs, Persona Selection Cards, Persona Cycling Autopilot Loop, Model / Effort / Parallel Run Config, Autopilot Feature-Dev Screenshot, Start an Autopilot Dialog

### Community 181 - "Board Overview Screenshot"
Cohesion: 0.38
Nodes (7): Agent Usage/Budget Meter (Claude, Codex, Antigravity, Copilot), Autopilot Feature Dev Cards, Workspace File Explorer Sidebar, Issue Card (FEAT-labeled task card), Kanban Board (Inbox/Todo/In Progress/Review/Done), New Task Button and Search Bar, Board Overview Screenshot

### Community 182 - "Chat Panel Screenshot"
Cohesion: 0.38
Nodes (7): Empty Conversation State (Start the Conversation), Ask the Agent Message Input Box, Agent/Model Selector (Latest opencode), New Chat Header with Ready Status Badge, Options Expander Link, Chat Panel Screenshot, Send Button with Keyboard Shortcut Hint

### Community 183 - "Awaiting Decision Screenshot"
Cohesion: 0.43
Nodes (7): Agent Thread Panel, Numbered Decision Prompt (Awaiting Input), Live Run Stats Panel (Model/Tokens/Cost), Reply-to-Agent Slash-Command Input, Run Detail Tab Navigation (Overview/Thread/Diff/Preview/Runs), Run Properties Panel, Run Detail — Awaiting Decision Screenshot

### Community 184 - "Task Detail Screenshot"
Cohesion: 0.38
Nodes (7): Agent Session Block (CLI Resume Command), Last Run Panel (Model, Tokens, Cost, Checks), Properties Panel (Status, Branch, Worktree, Base), Reply-to-Agent Input with Slash Commands, Task Detail Overview Screenshot, Task Tab Navigation (Overview/Thread/Diff/Preview/Runs), Task Detail Modal (Overview Tab)

### Community 185 - "API Scripts"
Cohesion: 0.29
Nodes (7): scripts, build, dev, prepublishOnly, test, test:watch, typecheck

### Community 186 - "Autopilot Dispatch Helpers"
Cohesion: 0.38
Nodes (6): buildAutopilotKickoff(), dispatchAutopilotChild(), DispatchAutopilotChildArgs, DispatchAutopilotChildDeps, EFFORT_GUIDANCE, inferCardKindFromLabels()

### Community 189 - "Mac Build Config"
Cohesion: 0.29
Nodes (7): mac, artifactName, category, gatekeeperAssess, hardenedRuntime, identity, target

### Community 190 - "Error Boundary"
Cohesion: 0.29
Nodes (3): ErrorBoundary, Props, State

### Community 191 - "Sibling Briefing"
Cohesion: 0.53
Nodes (5): BRIEFING_MARKER, extractFilePath(), recentFiles(), renderSiblingBriefing(), truncate()

### Community 193 - "Card Dispatch Tools Tests"
Cohesion: 0.40
Nodes (3): buildSupervisor(), makeHandle(), TestHandle

### Community 194 - "CLI Cloud Auth"
Cohesion: 0.47
Nodes (5): CloudSession, getCloudSession(), MinimalCloudConfig, requireCloudAuth(), userDataDir()

### Community 195 - "Linux Build Config"
Cohesion: 0.33
Nodes (6): linux, artifactName, category, target, AppImage, tar.xz

### Community 196 - "NSIS Installer Config"
Cohesion: 0.33
Nodes (6): nsis, allowToChangeInstallationDirectory, deleteAppDataOnUninstall, oneClick, perMachine, shortcutName

### Community 197 - "Font Licenses"
Cohesion: 0.40
Nodes (6): Inter Tight font license, Noto Color Emoji font license, Noto Sans Math font license, Noto Sans Symbols 2 font license, Noto Sans Symbols font license, SIL Open Font License 1.1

### Community 198 - "Collapsible Section"
Cohesion: 0.53
Nodes (5): CollapsibleSection(), CollapsibleSectionProps, readStored(), useCollapsibleSection(), writeStored()

### Community 199 - "Releasing Docs"
Cohesion: 0.40
Nodes (5): Build and packaging pipeline, Stable artifact naming scheme, Auto-update via electron-updater, release.yml single-workflow release pipeline, Unsigned builds (Gatekeeper / SmartScreen)

### Community 200 - "npx Verify Script"
Cohesion: 0.50
Nodes (4): crypto, fs, sha256(), verifyAgainst()

### Community 201 - "Supervisor Tests"
Cohesion: 0.50
Nodes (3): buildSupervisorWithFakes(), FakeHandle, makeFakeHandle()

### Community 202 - "Frame Error Reporting"
Cohesion: 0.50
Nodes (3): FrameError, reportFrameError(), ReportFrameErrorInput

### Community 203 - "GitHub Publish Config"
Cohesion: 0.40
Nodes (5): publish, owner, provider, releaseType, repo

### Community 204 - "Before Pack Script"
Cohesion: 0.40
Nodes (4): ARCH_NAMES, PLATFORM_NAMES, { resolve }, { spawnSync }

### Community 205 - "Card Ship Panel"
Cohesion: 0.60
Nodes (4): ShipPanel(), ensureCommitted(), onCreatePR(), onMerge()

### Community 206 - "Font Subset Tool"
Cohesion: 0.70
Nodes (4): collect_codepoints(), fmt_ranges(), is_emoji(), main()

### Community 207 - "API Keywords"
Cohesion: 0.50
Nodes (4): kanbots, keywords, handlers, ipc

### Community 208 - "API Repository Meta"
Cohesion: 0.50
Nodes (4): repository, directory, type, url

### Community 209 - "README Packages"
Cohesion: 0.50
Nodes (4): IssueSource contract, @kanbots/core package, @kanbots/local-store package, Workspace modes (local vs github)

### Community 210 - "Linux Installer Script"
Cohesion: 0.83
Nodes (3): die(), say(), install-linux.sh script

### Community 211 - "Agent Docs Runtime Notes"
Cohesion: 0.67
Nodes (3): Rate-limit cooldown, Run resume via session id, Agent stream event taxonomy

## Ambiguous Edges - Review These
- `Release Workflow` → `Kanbots npx launcher (npx kanbots)`  [AMBIGUOUS]
  npx-cli/README.md · relation: conceptually_related_to
- `Release Workflow` → `Tag-driven multi-OS release pipeline (as described in README)`  [AMBIGUOUS]
  README.md · relation: references
- `Hybrid lifecycle: detect, optionally manage, never force` → `VagasPoller (packages/desktop/src/vagas-poller.ts) — proposed`  [AMBIGUOUS]
  docs/specs/0001-vagas-ingestion.md · relation: semantically_similar_to
- `Electron process model (no HTTP for renderer)` → `Dispatcher port 8474`  [AMBIGUOUS]
  docs/getting-started.md · relation: conceptually_related_to
- `codex-cli provider id` → `ProviderId catalogue (agent vs chat-only)`  [AMBIGUOUS]
  docs/providers.md · relation: conceptually_related_to
- `kodra-mcp-server (stdio MCP process)` → `RTK PreToolUse hook`  [AMBIGUOUS]
  docs/rtk.md · relation: references
- `Kodra wordmark` → `Orbit ring motif`  [AMBIGUOUS]
  docs/assets/brand/kodra-wordmark-dark.png · relation: conceptually_related_to

## Knowledge Gaps
- **1413 isolated node(s):** `semi`, `singleQuote`, `trailingComma`, `printWidth`, `tabWidth` (+1408 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **18 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Release Workflow` and `Kanbots npx launcher (npx kanbots)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Release Workflow` and `Tag-driven multi-OS release pipeline (as described in README)`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **What is the exact relationship between `Hybrid lifecycle: detect, optionally manage, never force` and `VagasPoller (packages/desktop/src/vagas-poller.ts) — proposed`?**
  _Edge tagged AMBIGUOUS (relation: semantically_similar_to) - confidence is low._
- **What is the exact relationship between `Electron process model (no HTTP for renderer)` and `Dispatcher port 8474`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `codex-cli provider id` and `ProviderId catalogue (agent vs chat-only)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `kodra-mcp-server (stdio MCP process)` and `RTK PreToolUse hook`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **What is the exact relationship between `Kodra wordmark` and `Orbit ring motif`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._