# Gemini CLI - Project Summary

Gemini CLI is an open-source (Apache 2.0) AI agent that brings Google's Gemini
models directly into the terminal. Built with TypeScript, React, and Ink, it
provides a rich interactive CLI experience with built-in tools, MCP
extensibility, and multi-agent orchestration.

**Repository:** [google-gemini/gemini-cli](https://github.com/google-gemini/gemini-cli)
**Language:** TypeScript 5.3 | Node.js 20+ | React 19 + Ink 6
**Build:** esbuild + npm workspaces (monorepo)

---

## Table of Contents

- [Project Structure](#project-structure)
- [Overall Architecture (Mermaid)](#overall-architecture)
- [CLI Startup & Initialization](#1-cli-startup--initialization)
- [Core Orchestration Engine](#2-core-orchestration-engine)
- [Gemini API Communication](#3-gemini-api-communication)
- [Tool System](#4-tool-system)
- [Tool Execution & Confirmation Flow](#5-tool-execution--confirmation-flow)
- [Agent System](#6-agent-system)
- [MCP Integration](#7-mcp-integration)
- [Hook System](#8-hook-system)
- [Configuration System](#9-configuration-system)
- [Key File Reference](#key-file-reference)

---

## Project Structure

```
gemini-cli/
├── packages/
│   ├── cli/                   # Terminal UI (React + Ink), commands, config
│   ├── core/                  # Backend: API client, tools, agents, scheduler
│   ├── sdk/                   # Programmatic SDK for external consumers
│   ├── a2a-server/            # Agent-to-Agent protocol server (Express)
│   ├── test-utils/            # Shared test fixtures
│   └── vscode-ide-companion/  # VS Code extension
├── docs/                      # Documentation
├── integration-tests/         # E2E tests
├── evals/                     # Quality benchmarks
├── scripts/                   # Build & deploy scripts
└── schemas/                   # JSON schema validation
```

---

## Overall Architecture

```mermaid
flowchart TB
    subgraph CLI["packages/cli"]
        A["main()
        gemini.tsx:318"]
        B["loadSettings()
        config/settings.ts"]
        C["parseArguments()
        config/config.ts"]
        D["loadCliConfig()
        config/config.ts"]
        E["initializeApp()
        core/initializer.ts:35"]
        F["AppContainer
        ui/AppContainer.tsx:207"]
        G["runNonInteractive()
        nonInteractiveCli.ts:58"]
    end

    subgraph Core["packages/core"]
        H["GeminiClient
        core/client.ts:100"]
        I["Turn
        core/turn.ts:235"]
        J["GeminiChat
        core/geminiChat.ts:237"]
        K["ToolRegistry
        tools/tool-registry.ts:193"]
        L["Scheduler
        scheduler/scheduler.ts"]
        M["HookSystem
        hooks/hookSystem.ts"]
        N["AgentRegistry
        agents/registry.ts"]
    end

    subgraph External["External Systems"]
        O["Gemini API"]
        P["File System"]
        Q["Shell"]
        R["MCP Servers"]
    end

    A --> B --> C --> D --> E
    E --> F
    E --> G
    F --> H
    G --> H
    H --> I --> J
    J -->|generateContentStream| O
    H --> L --> K
    L -->|execute tools| P
    L -->|execute tools| Q
    K -->|MCP tools| R
    H --> M
    H --> N
```

---

## 1. CLI Startup & Initialization

The entry point is `main()` in `packages/cli/src/gemini.tsx:318`. It
orchestrates the entire startup sequence.

```mermaid
flowchart TD
    A["main()"] --> B["loadSettings()
    Load user + workspace settings"]
    B --> C["parseArguments()
    Parse CLI args via yargs"]
    C --> D["loadCliConfig() — Phase 1
    Partial config for auth"]
    D --> E["refreshAuth()
    Authenticate user"]
    E --> F{"Sandbox needed?"}
    F -->|Yes| G["start_sandbox() or
    relaunchAppInChildProcess()"]
    F -->|No| H["loadCliConfig() — Phase 2
    Full config: extensions, tools, MCP"]
    G --> H
    H --> I["config.storage.initialize()"]
    I --> J["initializeApp()
    Auth + theme validation"]
    J --> K{"Interactive mode?"}
    K -->|Yes| L["startInteractiveUI()
    Render AppContainer"]
    K -->|No| M["runNonInteractive()
    Headless execution"]
```

### Key Functions

#### `main()` — `packages/cli/src/gemini.tsx:318`

The top-level entry point. Sequentially:

1. `loadSettings()` — Loads user/workspace settings from disk
2. `parseArguments(settings)` — Parses CLI args (yargs)
3. `loadCliConfig()` (Phase 1) — Partial config for pre-sandbox auth
4. `partialConfig.refreshAuth()` — Runs authentication flow
5. `loadSandboxConfig()` — Checks if sandbox/relaunch is needed
6. `loadCliConfig()` (Phase 2) — Full config with extensions, tools, MCP
7. `initializeApp(config, settings)` — Final auth + theme validation
8. Routes to `startInteractiveUI()` or `runNonInteractive()`

#### `initializeApp()` — `packages/cli/src/core/initializer.ts:35`

```typescript
async function initializeApp(
  config: Config,
  settings: LoadedSettings,
): Promise<InitializationResult>
```

Performs final authentication via `performInitialAuth()`, validates theme
settings, and optionally connects to an IDE client. Returns an
`InitializationResult` containing `authError`, `themeError`, and
`shouldOpenAuthDialog`.

#### `AppContainer` — `packages/cli/src/ui/AppContainer.tsx:207`

The root React component for interactive mode. Sets up:

- UI state (processing, auth, model, quota, shell mode)
- Context providers (UIState, UIActions, Config, App, ToolActions, ShellFocus)
- `useGeminiStream` hook for streaming Gemini responses
- `useTextBuffer` for user input handling
- `useSessionResume` for checkpoint restoration

#### `runNonInteractive()` — `packages/cli/src/nonInteractiveCli.ts:58`

```typescript
async function runNonInteractive(params: RunNonInteractiveParams): Promise<void>
```

Headless execution flow:

1. Sets up console capture and stdin cancellation (Ctrl+C)
2. Processes `@include` commands and slash commands
3. Main loop: calls `geminiClient.sendMessageStream()`, iterates events
4. Handles `Content`, `ToolCallRequest`, `LoopDetected`, `Error` events
5. Dispatches tool calls via `scheduler.schedule()`
6. Loops until no pending tool calls, then outputs final result

---

## 2. Core Orchestration Engine

The core engine is built around three layered classes:
`GeminiClient` → `Turn` → `GeminiChat`.

```mermaid
flowchart TD
    A["GeminiClient.sendMessageStream()
    client.ts:786"] -->|"fires"| B["BeforeAgent hook"]
    B --> C["processTurn()
    client.ts:547"]
    C --> D["tryCompressChat()
    Compress if needed"]
    D --> E["tryMaskToolOutputs()
    Mask bulky outputs"]
    E --> F["ModelRouter.route()
    Select model"]
    F --> G["Turn.run()
    turn.ts:249"]
    G --> H["GeminiChat.sendMessageStream()
    geminiChat.ts:290"]
    H --> I["makeApiCallAndProcessStream()
    geminiChat.ts:465"]
    I -->|"fires"| J["BeforeModel hook"]
    J --> K["contentGenerator.generateContentStream()
    Actual Gemini API call"]
    K --> L["processStreamResponse()
    geminiChat.ts:810"]
    L -->|"fires"| M["AfterModel hook per chunk"]
    M --> N["Yield stream events:
    Content, Thought,
    ToolCallRequest, Finished"]
    N --> O{"Pending tool calls?"}
    O -->|Yes| P["Scheduler.schedule()
    Execute tools"]
    P --> Q["Send tool results back"]
    Q --> C
    O -->|No| R["fireAfterAgentHook()"]
    R --> S["Return final Turn"]
```

### Key Functions

#### `GeminiClient.sendMessageStream()` — `packages/core/src/core/client.ts:786`

```typescript
async *sendMessageStream(
  request: PartListUnion,
  signal: AbortSignal,
  prompt_id: string,
  turns: number = 100,
): AsyncGenerator<ServerGeminiStreamEvent, Turn>
```

Top-level entry for sending a user message. Fires `BeforeAgent` hook, then loops
up to `MAX_TURNS` (100) calling `processTurn()`. After all turns complete, fires
`AfterAgent` hook and returns the final `Turn`.

#### `GeminiClient.processTurn()` — `packages/core/src/core/client.ts:547`

A single conversation turn. Steps:

1. Check session turn limit
2. Compress chat history if over threshold
3. Mask bulky tool outputs
4. Estimate request token count
5. Route to model (sticky or fresh routing decision)
6. Call `turn.run()` to get streamed events
7. Check for invalid streams and retry
8. Check next speaker (model may request another turn)

#### `Turn.run()` — `packages/core/src/core/turn.ts:249`

```typescript
async *run(
  modelConfigKey: ModelConfigKey,
  req: PartListUnion,
  signal: AbortSignal,
): AsyncGenerator<ServerGeminiStreamEvent>
```

Calls `chat.sendMessageStream()` and processes chunks. For each chunk it yields
typed events: `Content`, `Thought`, `ToolCallRequest`, `Citation`, `Finished`,
`Error`. Function calls from the model are converted into
`ToolCallRequestInfo` objects via `handlePendingFunctionCall()`.

---

## 3. Gemini API Communication

```mermaid
flowchart TD
    A["GeminiChat.sendMessageStream()
    geminiChat.ts:290"] --> B["Create user content
    from message parts"]
    B --> C["Record to
    ChatRecordingService"]
    C --> D["Push to history"]
    D --> E{"Retry loop
    (max 2 attempts)"}
    E --> F["makeApiCallAndProcessStream()
    geminiChat.ts:465"]
    F --> G["applyModelSelection()
    Check availability / fallback"]
    G --> H["Fire BeforeModel hook
    Can modify config/contents"]
    H --> I["Fire BeforeToolSelection hook
    Can modify tools"]
    I --> J["contentGenerator
    .generateContentStream()
    Actual HTTP call to Gemini"]
    J --> K["processStreamResponse()
    geminiChat.ts:810"]
    K --> L{"For each chunk"}
    L --> M["Extract text, thoughts,
    function calls, citations"]
    M --> N["Record token usage"]
    N --> O["Fire AfterModel hook
    Can stop/block/modify"]
    O --> P["Yield processed chunk"]
    P --> L
    L -->|"Stream complete"| Q["Validate: finish reason,
    tool calls, empty text"]
    Q -->|"Invalid"| R["Throw InvalidStreamError
    → triggers retry"]
    Q -->|"Valid"| S["Push response to history"]
    R --> E
```

### Key Functions

#### `GeminiChat.sendMessageStream()` — `packages/core/src/core/geminiChat.ts:290`

```typescript
async sendMessageStream(
  modelConfigKey: ModelConfigKey,
  message: PartListUnion,
  prompt_id: string,
  signal: AbortSignal,
): Promise<AsyncGenerator<StreamEvent>>
```

Adds the user message to history, then enters a retry loop (max 2 attempts)
calling `makeApiCallAndProcessStream()`. Handles `InvalidStreamError` with
backoff retry. Returns an async generator of `StreamEvent` chunks.

#### `GeminiChat.makeApiCallAndProcessStream()` — `packages/core/src/core/geminiChat.ts:465`

Prepares the request with model availability fallback, fires `BeforeModel` and
`BeforeToolSelection` hooks, then calls
`contentGenerator.generateContentStream()`. Wraps everything in
`retryWithBackoff()` to handle 429 rate limits with automatic model fallback.

#### `GeminiChat.processStreamResponse()` — `packages/core/src/core/geminiChat.ts:810`

Processes streamed chunks from the API. For each chunk: extracts text, thoughts,
function calls, and citations. Records token usage. Fires `AfterModel` hook
(which can stop/block/modify). Validates the complete stream after iteration
(checks for finish reason, malformed function calls, empty text).

---

## 4. Tool System

### Tool Definition & Registration

```mermaid
flowchart TD
    A["Tool Definitions
    definitions/coreTools.ts"] -->|"ToolDefinition
    { base, overrides }"| B["resolveToolDeclaration()
    definitions/resolver.ts:17"]
    B -->|"FunctionDeclaration"| C["ToolRegistry
    tool-registry.ts:193"]

    D["Config initialization
    config/config.ts"] -->|"new ToolClass(config, bus)"| E["Tool Instances
    (ReadFileTool, ShellTool, ...)"]
    E -->|"registerTool()"| C

    F["MCP Servers"] -->|"listTools()"| G["McpClient
    mcp-client.ts"]
    G -->|"DiscoveredMCPTool"| C

    H["Discovery Command"] -->|"JSON output"| I["discoverAndRegisterToolsFromCommand()"]
    I -->|"DiscoveredTool"| C

    C -->|"getFunctionDeclarations(modelId)"| J["Gemini API Request"]
    C -->|"getTool(name)"| K["Scheduler for execution"]
```

### Tool Definition Format

Each tool is defined in `packages/core/src/tools/definitions/coreTools.ts`:

```typescript
interface ToolDefinition {
  base: FunctionDeclaration;      // Name, description, parameters schema
  overrides?: (modelId: string)   // Model-specific customization
    => Partial<FunctionDeclaration> | undefined;
}
```

`resolveToolDeclaration()` (`definitions/resolver.ts:17`) merges model-specific
overrides with the base declaration.

### Tool Class Hierarchy

```mermaid
classDiagram
    class ToolInvocation {
        <<interface>>
        +getDescription()
        +shouldConfirmExecute()
        +execute(signal) ToolResult
    }

    class BaseToolInvocation {
        #messageBus: MessageBus
        #getConfirmationDetails()
        #publishPolicyUpdate()
    }

    class DeclarativeTool {
        <<abstract>>
        +getSchema(modelId) FunctionDeclaration
        +build(params) ToolInvocation
        +validateToolParams(params)
    }

    class BaseDeclarativeTool {
        +build(params) ToolInvocation
        #createInvocation()* ToolInvocation
    }

    ToolInvocation <|.. BaseToolInvocation
    DeclarativeTool <|-- BaseDeclarativeTool
    BaseDeclarativeTool --> BaseToolInvocation : creates

    BaseDeclarativeTool <|-- ReadFileTool
    BaseDeclarativeTool <|-- WriteFileTool
    BaseDeclarativeTool <|-- EditTool
    BaseDeclarativeTool <|-- ShellTool
    BaseDeclarativeTool <|-- RipGrepTool
    BaseDeclarativeTool <|-- GlobTool
    BaseDeclarativeTool <|-- LSTool
```

All tools follow the same pattern:

1. Extend `BaseDeclarativeTool`
2. Define parameters schema
3. Implement `createInvocation()` — returns a `BaseToolInvocation` subclass
4. The invocation's `execute()` does the actual work

### Built-in Tool Registration Order

In `packages/core/src/config/config.ts`, tools are registered:

| Priority | Category | Tools |
|----------|----------|-------|
| 0 | Read | `LSTool`, `ReadFileTool` |
| 0 | Search | `RipGrepTool` (or `GrepTool` fallback), `GlobTool` |
| 0 | Plan | `ActivateSkillTool` |
| 0 | Edit | `EditTool`, `WriteFileTool` |
| 0 | Fetch | `WebFetchTool` |
| 0 | Execute | `ShellTool` |
| 0 | Communicate | `MemoryTool`, `WebSearchTool`, `AskUserTool` |
| 0 | Plan Mode | `WriteTodosTool`, `ExitPlanModeTool`, `EnterPlanModeTool` |
| 1 | Discovered | Tools from discovery command |
| 2 | MCP | Tools from MCP servers |

### Key Tool Implementations

#### `ReadFileTool` — `packages/core/src/tools/read-file.ts`

- **Params:** `{ file_path, offset?, limit? }`
- Validates path access, reads content via `processSingleFileContent()`
- Handles text, images (PNG/JPG/GIF/WEBP/SVG/BMP), audio, and PDF
- Returns truncation info for large files

#### `WriteFileTool` — `packages/core/src/tools/write-file.ts`

- **Params:** `{ file_path, content, modified_by_user?, ai_proposed_content? }`
- Generates unified diff, detects/preserves line endings
- Integrates with IDE client for visual confirmation
- Calls `ensureCorrectFileContent()` for consistency

#### `EditTool` — `packages/core/src/tools/edit.ts`

- **Params:** `{ file_path, old_string, new_string, expected_replacements? }`
- `calculateExactReplacement()` — attempts literal match first
- `calculateFlexibleReplacement()` — fuzzy fallback if exact match fails
- LLM-based fallback repair via `FixLLMEditWithInstruction` if both fail
- Tracks modifications via SHA256 hash

#### `ShellTool` — `packages/core/src/tools/shell.ts`

- **Params:** `{ command, description?, dir_path?, is_background? }`
- Platform-specific: `powershell.exe` (Windows) or `bash -c` (Unix)
- Background process support, output streaming, process group management
- Combined stdout/stderr capture with exit code reporting

#### `RipGrepTool` — `packages/core/src/tools/ripGrep.ts`

- **Params:** `{ pattern, dir_path?, include?, context, max_matches_per_file, ... }`
- Auto-downloads ripgrep binary if unavailable
- Uses `execStreaming()` for efficient command execution
- Respects `.gitignore` patterns, supports context lines

---

## 5. Tool Execution & Confirmation Flow

```mermaid
flowchart TD
    A["Model returns FunctionCall"] --> B["Turn.handlePendingFunctionCall()
    turn.ts:400"]
    B -->|"ToolCallRequestInfo"| C["Scheduler.schedule()
    scheduler.ts"]
    C --> D["_startBatch()"]
    D --> E["Get tool from ToolRegistry"]
    E --> F["tool.build(params)
    Validate & create invocation"]
    F --> G["_processQueue()
    State machine loop"]
    G --> H["checkPolicy()"]
    H -->|ALLOW| I["ToolExecutor.execute()"]
    H -->|DENY| J["Create error result"]
    H -->|ASK_USER| K["resolveConfirmation()
    confirmation.ts:108"]
    K --> L["shouldConfirmExecute()
    Get confirmation details"]
    L --> M["Fire hook notification"]
    M --> N["State → AwaitingApproval"]
    N --> O["waitForConfirmation()
    Race: MessageBus vs IDE"]
    O -->|ProceedOnce| I
    O -->|Cancel| J
    O -->|ModifyWithEditor| P["Open external editor
    Apply modifications"]
    P --> K
    I --> Q["executeToolWithHooks()
    Fire BeforeTool / AfterTool hooks"]
    Q --> R["tool.execute(signal)"]
    R --> S["Create ToolResult
    { llmContent, returnDisplay, error?, data? }"]
    S --> T["CompletedToolCall
    Returned to GeminiClient"]
    T --> U["Send function response
    back to Gemini API"]
```

### State Machine

Each tool call transitions through these states:

```mermaid
stateDiagram-v2
    [*] --> Validating
    Validating --> Scheduled : Policy approved
    Validating --> Error : Validation failed
    Scheduled --> AwaitingApproval : Requires user confirmation
    Scheduled --> Executing : Auto-approved
    AwaitingApproval --> Scheduled : User confirmed
    AwaitingApproval --> Cancelled : User rejected
    Executing --> Success : Completed
    Executing --> Error : Failed
    Executing --> Cancelled : Aborted
    Success --> [*]
    Error --> [*]
    Cancelled --> [*]
```

### Key Functions

#### `Scheduler.schedule()` — `packages/core/src/scheduler/scheduler.ts`

```typescript
async schedule(
  request: ToolCallRequestInfo | ToolCallRequestInfo[],
  signal: AbortSignal,
): Promise<CompletedToolCall[]>
```

Queues tool calls for execution. If already processing, enqueues for next batch.
Otherwise calls `_startBatch()` → `_processQueue()`.

#### `resolveConfirmation()` — `packages/core/src/scheduler/confirmation.ts:108`

Interactive confirmation loop. Gets confirmation details from the tool, fires
hook notification, sets state to `AwaitingApproval`, waits for user response via
`waitForConfirmation()`. Supports `ModifyWithEditor` (opens Vim etc. and loops
back) and inline IDE modifications.

#### `ToolExecutor.execute()` — `packages/core/src/scheduler/tool-executor.ts`

Executes a validated tool call by calling `executeToolWithHooks()`, which fires
`BeforeTool`/`AfterTool` hooks around the actual `tool.execute()` call. Returns
`CompletedToolCall` with success/error/cancelled result.

#### `SchedulerStateManager.updateStatus()` — `packages/core/src/scheduler/state-manager.ts`

Manages state transitions and publishes changes via `MessageBus`. The
`TOOL_CALLS_UPDATE` event notifies the UI of state changes for live rendering.

### Confirmation Outcomes

| Outcome | Effect |
|---------|--------|
| `ProceedOnce` | Execute this one time |
| `ProceedAlways` | Execute and auto-approve future calls of this tool |
| `ProceedAlwaysAndSave` | Auto-approve and persist to policy |
| `ProceedAlwaysServer` | (MCP) Trust entire server |
| `ProceedAlwaysTool` | (MCP) Trust specific MCP tool |
| `Cancel` | Reject execution |
| `ModifyWithEditor` | Open external editor, then re-confirm |

---

## 6. Agent System

```mermaid
flowchart TD
    A["AgentRegistry.initialize()
    agents/registry.ts"] --> B["loadAgents()"]
    B --> C["Built-in Agents"]
    B --> D["User Agents
    ~/.gemini/agents/"]
    B --> E["Project Agents
    .gemini/agents/"]

    C --> F["GeneralistAgent
    All tools, 10min max, 20 turns"]
    C --> G["CodebaseInvestigatorAgent
    Read-only tools, 3min max, 10 turns"]
    C --> H["CliHelpAgent
    CLI documentation assistant"]

    F --> I["Model: inherited from config"]
    G --> J["Model: Flash for preview, Pro for others"]
    H --> K["Model: lightweight"]
```

### Agent Definitions

Agents are defined as `LocalAgentDefinition<Schema>` objects in
`packages/core/src/agents/`.

| Agent | File | Tools | Max Time | Max Turns |
|-------|------|-------|----------|-----------|
| **Generalist** | `generalist-agent.ts` | All tools | 10 min | 20 |
| **Codebase Investigator** | `codebase-investigator.ts` | Read-only (ls, read_file, glob, grep, web_fetch) | 3 min | 10 |
| **CLI Help** | `cli-help-agent.ts` | Documentation access | - | - |

The `AgentRegistry` discovers agents from built-in directories plus
user/project-level agent directories. Each agent has its own system prompt, tool
set, model selection, and output schema.

---

## 7. MCP Integration

```mermaid
flowchart TD
    A["Settings: mcpServers config"] --> B["McpClientManager"]
    B --> C["McpClient per server
    mcp-client.ts"]
    C --> D["Connect via transport
    (stdio / SSE / HTTP)"]
    D --> E["client.listTools()
    Discover server tools"]
    E --> F["Create DiscoveredMCPTool
    for each tool"]
    F --> G["Register in ToolRegistry
    Name: serverName__toolName"]

    H["Model requests MCP tool"] --> I["ToolRegistry.getTool()
    Resolves qualified name"]
    I --> J["DiscoveredMCPToolInvocation
    mcp-tool.ts"]
    J --> K{"Trusted?"}
    K -->|Yes| L["Execute via
    mcpClient.callTool()"]
    K -->|No| M["Confirmation dialog
    with server/tool info"]
    M -->|Approved| L
    L --> N["Convert MCP content blocks
    to LLM-compatible format"]
    N --> O["Return ToolResult"]
```

### Key Classes

#### `McpClient` — `packages/core/src/tools/mcp-client.ts`

Each MCP server gets its own `McpClient` instance with:

- **Status tracking:** `DISCONNECTED` → `CONNECTING` → `CONNECTED`
- **Transport:** Stdio, SSE, or StreamableHTTP
- **Tool discovery:** `listTools()` → register as `DiscoveredMCPTool`
- **OAuth support** via `MCPOAuthProvider`

#### `DiscoveredMCPToolInvocation` — `packages/core/src/tools/mcp-tool.ts`

Wraps MCP server tools with the same `ToolInvocation` interface as built-in
tools. Adds MCP-specific confirmation options (trust server, trust tool).
Converts MCP content blocks (text, media, resource) to LLM-compatible format.

---

## 8. Hook System

```mermaid
flowchart TD
    A["Hook Configuration
    settings.json / extensions"] --> B["HookRegistry
    hookRegistry.ts"]
    B --> C["Load & validate hooks"]
    C --> D["getHooksForEvent(eventName)"]

    E["Hook Event Fired
    (BeforeModel, AfterTool, etc.)"] --> F["HookPlanner
    Plan execution"]
    F --> G["HookRunner
    hookRunner.ts"]
    G --> H["Spawn hook process
    (command hook)"]
    H --> I{"Exit code?"}
    I -->|"0"| J["Success: parse stdout as JSON"]
    I -->|"1"| K["Non-blocking error: log warning"]
    I -->|"2"| L["Blocking error: stop execution"]
    J --> M["HookAggregator
    hookAggregator.ts"]
    M --> N["Merge results from
    multiple hooks"]
    N --> O["Return to caller
    (can modify, stop, block)"]
```

### Hook Events

| Event | Trigger Point | Capabilities |
|-------|--------------|-------------|
| `SessionStart` | App initialization | Modify session setup |
| `BeforeAgent` | Before `sendMessageStream()` | Stop/block agent, add context |
| `AfterAgent` | After all turns complete | Post-process response, clear context |
| `BeforeModel` | Before each API call | Modify config/contents, stop/block |
| `AfterModel` | After each response chunk | Modify response, stop/block |
| `BeforeToolSelection` | Before sending tools to API | Override tool list/config |
| `BeforeTool` | Before tool execution | Modify/block tool call |
| `AfterTool` | After tool execution | Process tool result |
| `Notification` | Tool confirmation pending | Notify external systems |
| `PreCompress` | Before chat compression | Save important context |
| `SessionEnd` | Session termination | Cleanup actions |

### Hook Configuration

Hooks are defined in `settings.json` as shell commands:

```json
{
  "hooks": {
    "BeforeTool": [{
      "matcher": "run_shell_command",
      "hooks": [{
        "type": "command",
        "command": "node validate-command.js"
      }]
    }]
  }
}
```

Configuration sources (highest to lowest precedence): Project → User → System →
Extensions.

**Security:** Project hooks are blocked in untrusted folders. Default timeout is
60 seconds.

---

## 9. Configuration System

```mermaid
flowchart TD
    A["Hardcoded Defaults
    (lowest precedence)"] --> G["MergedSettings"]
    B["System Defaults
    /etc/gemini-cli/system-defaults.json"] --> G
    C["User Settings
    ~/.gemini/settings.json"] --> G
    D["Project Settings
    .gemini/settings.json"] --> G
    E["System Overrides
    /etc/gemini-cli/settings.json"] --> G
    F["Environment Variables
    + CLI Arguments
    (highest precedence)"] --> G

    G --> H["loadCliConfig()
    config/config.ts"]
    H --> I["ExtensionManager
    Load extensions"]
    H --> J["Load GEMINI.md
    Hierarchical memory"]
    H --> K["PolicyEngine
    Folder trust"]
    H --> L["ToolRegistry
    Register all tools"]
    H --> M["MCP Servers
    Connect and discover"]
    H --> N["HookSystem
    Load hook definitions"]
    H --> O["Auth Provider
    OAuth / API Key / Vertex"]
```

### Two-Phase Loading

Configuration is loaded twice:

1. **Phase 1 (pre-sandbox):** Partial config sufficient for authentication and
   admin settings decisions
2. **Phase 2 (post-sandbox):** Full config with extensions, tools, MCP servers,
   and policy engine

### Key Settings Categories

| Category | Key Options |
|----------|-----------|
| `general` | `vimMode`, `preferredEditor`, `defaultApprovalMode` (default/auto_edit/plan) |
| `ui` | `theme`, `autoThemeSwitching`, `inlineThinkingMode` |
| `model` | `name`, `maxSessionTurns`, `compressionThreshold` |
| `tools` | `sandbox` (true/false/docker/podman), shell config, allowed/excluded tools |
| `mcp` / `mcpServers` | MCP server command configuration per server |
| `security` | `folderTrust`, `envVarRedaction`, auth type enforcement |
| `hooks` | `BeforeTool`, `AfterTool`, `BeforeModel`, etc. lifecycle hooks |
| `experimental` | `agents`, `extensionManagement`, `jitContext`, plan mode |

### Key Environment Variables

```
GEMINI_API_KEY, GEMINI_MODEL, GOOGLE_API_KEY,
GOOGLE_CLOUD_PROJECT, GOOGLE_APPLICATION_CREDENTIALS,
GEMINI_CLI_HOME, GEMINI_SANDBOX, DEBUG
```

---

## Key File Reference

| Component | File | Key Symbols |
|-----------|------|-------------|
| CLI Entry | `packages/cli/src/gemini.tsx:318` | `main()` |
| Interactive UI | `packages/cli/src/ui/AppContainer.tsx:207` | `AppContainer` |
| Headless Mode | `packages/cli/src/nonInteractiveCli.ts:58` | `runNonInteractive()` |
| App Init | `packages/cli/src/core/initializer.ts:35` | `initializeApp()` |
| Config Load | `packages/cli/src/config/config.ts` | `loadCliConfig()` |
| Settings | `packages/cli/src/config/settings.ts` | `loadSettings()` |
| Auth | `packages/cli/src/config/auth.ts` | `validateAuthMethod()` |
| GeminiClient | `packages/core/src/core/client.ts:100` | `GeminiClient`, `sendMessageStream()`, `processTurn()` |
| Turn | `packages/core/src/core/turn.ts:235` | `Turn`, `run()`, `handlePendingFunctionCall()` |
| GeminiChat | `packages/core/src/core/geminiChat.ts:237` | `GeminiChat`, `sendMessageStream()`, `makeApiCallAndProcessStream()`, `processStreamResponse()` |
| Tool Definitions | `packages/core/src/tools/definitions/coreTools.ts` | `READ_FILE_DEFINITION`, `SHELL_DEFINITION`, etc. |
| Tool Resolver | `packages/core/src/tools/definitions/resolver.ts:17` | `resolveToolDeclaration()` |
| Tool Registry | `packages/core/src/tools/tool-registry.ts:193` | `ToolRegistry`, `registerTool()`, `getTool()` |
| Tool Base | `packages/core/src/tools/tools.ts` | `DeclarativeTool`, `BaseDeclarativeTool`, `BaseToolInvocation` |
| Scheduler | `packages/core/src/scheduler/scheduler.ts` | `Scheduler`, `schedule()`, `_processQueue()` |
| Confirmation | `packages/core/src/scheduler/confirmation.ts:108` | `resolveConfirmation()`, `waitForConfirmation()` |
| Tool Executor | `packages/core/src/scheduler/tool-executor.ts` | `ToolExecutor.execute()` |
| State Manager | `packages/core/src/scheduler/state-manager.ts` | `SchedulerStateManager`, `updateStatus()` |
| Agent Registry | `packages/core/src/agents/registry.ts` | `AgentRegistry`, `loadAgents()` |
| Hook System | `packages/core/src/hooks/hookSystem.ts` | `HookSystem` |
| Hook Registry | `packages/core/src/hooks/hookRegistry.ts` | `HookRegistry`, `getHooksForEvent()` |
| Hook Runner | `packages/core/src/hooks/hookRunner.ts` | `HookRunner`, `executeHook()` |
| MCP Client | `packages/core/src/tools/mcp-client.ts` | `McpClient`, `connectServer()`, `callTool()` |
| MCP Tool | `packages/core/src/tools/mcp-tool.ts` | `DiscoveredMCPToolInvocation` |
| ReadFile | `packages/core/src/tools/read-file.ts` | `ReadFileTool` |
| WriteFile | `packages/core/src/tools/write-file.ts` | `WriteFileTool` |
| Edit | `packages/core/src/tools/edit.ts` | `EditTool` |
| Shell | `packages/core/src/tools/shell.ts` | `ShellTool` |
| RipGrep | `packages/core/src/tools/ripGrep.ts` | `RipGrepTool` |
| Glob | `packages/core/src/tools/glob.ts` | `GlobTool` |
