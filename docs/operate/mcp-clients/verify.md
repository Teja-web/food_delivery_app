# Verify MCP Client

*Purpose: confirm each supported MCP client (Cursor, Claude Code, Cline, Zed) can reach the coznt server.*

Manual steps to confirm coznt's MCP server is wired correctly in each supported client. Run after a fresh install of coznt or any change to `src/mcp/`.

The automated tests in `tests/mcp/` cover the *protocol contract* (every verb has a valid schema, descriptions are non-empty, phase enforcement matches between layers). This doc covers what they can't: that real clients actually see and can invoke the verbs.

---

## Preferred bootstrap: `coznt connect`

For most devs, the right path is the CLI — it detects the editor, writes the right MCP config, prompts for the API key, and runs an initial choreography sync in one shot:

```bash
coznt connect --project=<slug-or-id>
```

See [`../cli.md`](../cli.md) for the full flag reference. The manual paths below remain as fallback for clients the CLI doesn't auto-detect, user-global setups, or custom MCP launchers.

---

## Before you start

1. Coznt dev server running on `http://localhost:3029` (or note the URL for `COZNT_URL`).
2. An API key issued from `/api-keys` — note the plaintext value, you can't recover it later.
3. At least one project created (the verbs need something to bind to).

---

## Cursor

Config: `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` in a workspace (project-local; preferred — keeps the key out of `~`).

1. Copy `docs/mcp-clients/cursor.json` into the target location. Replace:
   - `cwd` with the absolute path to your coznt checkout
   - `COZNT_API_KEY` with the plaintext key from `/api-keys`
2. Restart Cursor (Cmd-Q, reopen). MCP servers don't hot-reload.
3. Open the Cursor settings sidebar → **MCP**. The `coznt` entry should show as **connected** with a green dot. If red: hover for the stderr line.
4. Open a chat. Ask: *"What MCP tools do you have?"* — the agent should list `set_project`, `get_my_context`, etc.
5. Ask: *"Use coznt to set the project to <your project slug>."* — should succeed, agent confirms.
6. Ask: *"What's the status?"* — agent should call `get_project_status` and return phase + gates.

**If verbs don't appear:** check stderr in Cursor's MCP panel. Common causes: wrong `cwd`, missing `COZNT_API_KEY`, dev server not running.

---

## Claude Code

Config: `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or the equivalent on your platform.

1. Copy `docs/mcp-clients/claude-code.json` into the file (merge with existing `mcpServers` if present).
2. Update `args[0]` to the absolute path of your coznt checkout.
3. Restart Claude. MCP servers load on startup.
4. Start a conversation. The MCP icon (top-right of input) should show `coznt` with tool count.
5. Click the icon → tool list should match what `tests/mcp/tool-registry.test.ts` asserts (27 verbs).
6. Invoke: *"Set project to <slug> via coznt and tell me what phase it's in."* Confirm round-trip works.

**Note:** Claude Code can run `.ts` directly via `node --import tsx` if you have tsx installed globally; otherwise build first.

---

## Cline (VS Code extension)

Config: VS Code settings JSON → `cline.mcpServers` (or via Cline's settings UI under MCP Servers).

1. Copy `docs/mcp-clients/cline.json` content into the relevant settings location.
2. Update the absolute path.
3. Reload VS Code window.
4. Open Cline panel → **MCP Servers** tab → `coznt` should appear with tool count. If it's listed but tools show 0, check the server stderr in the Cline output panel.
5. Start a task. Ask Cline to call `get_my_context` against the coznt MCP.

**Common issue:** Cline runs each MCP in its own process; if you have multiple workspaces open, only the focused one's config is honored.

---

## Zed

Config: `~/.config/zed/settings.json` (under `context_servers`).

1. Copy `docs/mcp-clients/zed.json` content into your Zed settings (merge with existing `context_servers`).
2. Restart Zed.
3. Open the assistant panel. Type `/` — the slash-command menu should include coznt's tools.
4. Try `/set_project <slug>` and confirm the response.

**Note:** Zed's MCP integration as of 2026 still surfaces some tools via slash-commands rather than freeform tool calls; behavior here may differ from Cursor/Claude.

---

## Quick sanity checklist (any client)

For each client, the bare-minimum smoke test:

- [ ] Server connects (no stderr on startup)
- [ ] `tools/list` returns ≥ 21 tools
- [ ] `set_project` with a real slug succeeds
- [ ] `get_my_context` after set_project returns the project + phase
- [ ] `get_phase_checklist` returns gates for the current phase
- [ ] A phase-gated verb (e.g. `log_decision` in the requirements phase) fails with the fast-fail message — `Tool "log_decision" is not available in the requirements phase.`

If all six pass, the wiring is solid.

---

## When to update this doc

- A new MCP client ships and an org wants to use it
- A client changes its config schema (Cursor / Claude Code do this periodically)
- New verbs land and the tool count in the checklist drifts
- The bundling story changes (e.g. coznt-mcp ships as a precompiled binary)
