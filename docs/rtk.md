# RTK output compression

RTK (Rust Token Killer) is an optional, user-installed CLI that compresses
verbose shell command output so spawned agents spend fewer tokens reading
build, test, and git noise. kanbots does **not** bundle or auto-install RTK;
this page is opt-in guidance for installing it alongside kanbots. See the
[upstream RTK README](https://github.com/rtk-ai/rtk/blob/develop/README.md) and
[rtk-ai.app](https://www.rtk-ai.app) for the current upstream documentation.

## What it does

- Intercepts supported command output and summarizes it. For example,
  `git status` can become `3 files, +10 -2`, and `cargo test` can become
  `2 failed, 18 ok`.
- Includes 64 command filters across common ecosystems: git, cargo, go,
  npm/pnpm, pytest, rspec, docker, kubectl, playwright, and others.
- Preserves the wrapped command's exit code, so a summarized failure still
  fails the agent's command step.
- Falls back to raw output if filtering fails.
- Uses a transparent `PreToolUse` hook to rewrite commands such as
  `git status` to `rtk git status` before they run.

RTK is **not** a memory system, an MCP server, or an agent framework. It is
purely a CLI output optimization. In the architecture described by
[ADR-0001](adr/0001-integration-vision-memory-and-cost-optimization.md), it is
the cost-optimization axis and is orthogonal to `agentmemory`. See also
[ADR-0006](adr/0006-rtk-cli-output-compression.md).

## Why it matters for kanbots

Agent runs inside worktrees generate a lot of build, test, and git output that
the agent reads back. RTK reduces that share of the output, so kanbots cost
budgets can go further and autopilot sessions can run longer before reaching
their caps. The relevant settings are `runCostBudgetUsd` and
`sessionCostBudgetUsd` in `.kanbots/config.json`; see
[`docs/configuration.md`](configuration.md) and
[`docs/agents.md`](agents.md).

RTK estimates tokens as `bytes / 4`; it does not use a tokenizer. Its
percentages are therefore useful as ratios, but absolute token counts are
approximate. The savings apply to command-output bytes, not to the whole bill.

## Install

RTK is installed separately from kanbots:

```sh
curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/master/install.sh | sh
rtk init -g    # installs the PreToolUse hook into your agent CLI config(s)
rtk gain       # verify — should show a savings dashboard
rtk --version  # confirm the right binary
```

There is an unrelated package named `reachingforthejack/rtk` (Rust Type Kit).
If `rtk gain` says `command not found`, you have the wrong package or the
binary is not on your `PATH`. Verification requires that `rtk gain` works.

## How it reaches kanbots-spawned agents

RTK's hook lives in the user's agent CLI configuration, for example
`~/.claude/settings.json`. kanbots spawns the same agent CLIs (Claude Code,
Codex, and others), so spawned runs inherit the transparent rewrite
automatically. No per-worktree setup is needed.

If kanbots spawns an agent with an explicit `--mcp-config` or settings override
that bypasses the user-global configuration, RTK's hook may not apply. This is
unusual; RTK still works for the common case.

## Configuration (optional)

The optional `rtk` section in `.kanbots/config.json` can record that RTK is
available:

```jsonc
{
  "rtk": {
    "assumeInstalled": true
  }
}
```

When `assumeInstalled: true`, kanbots will annotate the cost-budget UI with
projected savings. This is a hint, not a measurement: kanbots does not invoke
RTK and cannot measure its savings. RTK keeps its own analytics at
`~/.local/share/rtk/history.db`. The default is omitted or `false`, which
means no annotation. Omitting the whole `rtk` section is fine.

## Troubleshooting

- **Agent misread a compressed test failure:** disable RTK for one run with
  `rtk proxy <cmd>`, or temporarily remove the hook with
  `rtk init -g --undo` (or edit the agent config). See RTK's documentation for
  the current details.
- **Savings look off:** RTK's numbers are byte-ratio estimates (`bytes / 4`),
  not final-bill figures.
- **Name collision:** check the verification step above and make sure the
  installed `rtk` is the RTK CLI from `rtk-ai/rtk`.
- **Windows:** RTK supports Windows, but check RTK's `INSTALL.md` for current
  status and instructions.

## Files of interest

- `docs/adr/0006-rtk-cli-output-compression.md` — the decision record
- `docs/adr/0001-integration-vision-memory-and-cost-optimization.md` — the
  cost-optimization axis
- `.kanbots/config.json` → `rtk.assumeInstalled` — validated by
  `packages/local-store/src/workspace.ts`

kanbots does not manage RTK in v1; the config field is the only kanbots-side
touchpoint for now.
