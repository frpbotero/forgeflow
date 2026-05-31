# ForgeFlow Agent Specification

## Product Goal
ForgeFlow Agent is a file-first CLI orchestrator that installs into a project and coordinates AI coding workflows across multiple agent CLIs (Codex, Claude, Gemini, Copilot, and custom). It provides shared operational memory, planning artifacts, questions, decisions, and handoff context through versioned Markdown/JSON files.

The product must avoid lock-in to any specific LLM provider by generating portable context and prompts.

## Supported Agents
Initial support targets:
- Codex CLI
- Claude CLI
- Gemini CLI
- GitHub Copilot (instruction/prompt generation mode)
- Custom CLI adapter

Execution mode is adapter-based. If a CLI cannot be executed safely from terminal, ForgeFlow must fall back to prompt-generation mode.

## Project Structure
Recommended project layout:

```txt
/dev
  /docs
  /specs
  /skills
  /forgeflow
  /agents
```

ForgeFlow-managed state path (default):
- `./dev/forgeflow`

Mandatory files (MVP):
- `project-state.json`
- `planning.md`
- `roadmap.md`
- `questions.md`
- `decisions.md`

Extended files (next iterations):
- `execution-log.md`
- `handoff.md`
- `context.md`

## Shared State Model
`/dev/forgeflow/project-state.json` is the canonical machine-readable state.

Minimum schema (MVP):
- `projectName: string`
- `configuredAgents: string[]`
- `activeAgent: string | null`
- `paths: { docs: string, specs: string, skills: string, state: string }`
- `stack: { angular: boolean, pwa: boolean, nestjs: boolean }`
- `currentPhase: "init" | "planning" | "implementation" | "review" | "testing" | "handoff"`
- `status: Record<string, "pending" | "in_progress" | "done" | "blocked">`
- `openQuestions: number`
- `lastUpdatedBy: string`
- `version: number`
- `updatedAt: string (ISO-8601)`

State principles:
- File-first, no database in MVP
- Human-readable + machine-parseable
- Git-versioned by default
- Deterministic rebuild via `forgeflow sync`

## Planning Flow
Command:
```bash
forgeflow plan --docs ./dev/docs --specs ./dev/specs
```

Behavior:
1. Load docs/specs.
2. Extract functional and technical requirements.
3. Build/refresh `planning.md`.
4. Generate execution phases in `roadmap.md`.
5. Register ambiguities in `questions.md`.
6. Update `project-state.json` (`currentPhase=planning`).

Outputs:
- `/dev/forgeflow/planning.md`
- `/dev/forgeflow/roadmap.md`
- `/dev/forgeflow/questions.md`
- `/dev/forgeflow/project-state.json`

## Question Flow
Commands:
```bash
forgeflow questions
forgeflow answer Q-001 "..."
```

Behavior:
- `questions` lists pending questions from `questions.md`.
- `answer` updates question status, appends decision context to `decisions.md`, and updates `project-state.json` counters/version.

Question lifecycle:
- `pending_user_answer`
- `answered`
- `obsolete`

## Handoff Flow
Command:
```bash
forgeflow handoff --to <agent>
```

Behavior:
1. Read current planning/state/questions/decisions.
2. Generate compact transfer context in `handoff.md`.
3. Mark destination agent and phase transition in `project-state.json`.
4. Optionally generate agent-specific prompt file in `/dev/forgeflow/generated`.

## CLI Commands
MVP (`v0.1`):
- `forgeflow init`
- `forgeflow configure`
- `forgeflow plan`
- `forgeflow status`
- `forgeflow questions`
- `forgeflow answer <id> <text>`
- `forgeflow handoff --to <agent>`

`v0.2`:
- `forgeflow prompt --agent <agent> --task "..."`
- `forgeflow run --agent <agent> --task "..."` (where adapter supports execution)
- `forgeflow checkpoint --name "..."`

`v0.3+`:
- `forgeflow sync`
- `forgeflow rollback --to <checkpoint>`
- `forgeflow dev --agent <agent> --task "..."`

## Agent Adapters
Core interface:

```ts
export interface AgentAdapter {
  name: string;
  isInstalled(): Promise<boolean>;
  supportsDirectRun(): boolean;
  buildCommand(input: AgentRunInput): Promise<string>;
  run?(input: AgentRunInput): Promise<AgentRunResult>;
  generatePrompt(input: AgentRunInput): Promise<string>;
}
```

Rules:
- Adapters must be replaceable and independent.
- Copilot adapter defaults to prompt/instruction generation.
- All adapters must consume the same normalized context payload.

## Angular Skill
Expected skill scope:
- Standalone components structure
- Routing and feature organization
- Service layer and API integration strategy
- UI consistency rules and accessibility baseline

Artifact target:
- `/dev/skills/angular.skill.md`

## Angular PWA Skill
Expected skill scope:
- Service worker strategy
- Offline caching policy
- Installability requirements
- Sync/replay strategy for offline actions

Artifact target:
- `/dev/skills/pwa.skill.md`

## NestJS Skill
Expected skill scope:
- Modular architecture
- DTO validation conventions
- Auth strategy integration points
- Testing strategy for services/controllers

Artifact target:
- `/dev/skills/nestjs.skill.md`

## Testing Skill
Expected skill scope:
- Unit, integration, and e2e levels
- Coverage targets by layer
- Test data and mocking conventions
- CI validation gates

Artifact target:
- `/dev/skills/test-automation.skill.md`

## Security Skill
Expected skill scope:
- Auth and session/token handling controls
- Input validation and output sanitization
- Secrets management policy
- Audit and threat checklist for releases

Artifact target:
- `/dev/skills/security.skill.md`

## MVP Roadmap
### v0.1 (State and Planning Foundation)
- CLI bootstrap and init/configure
- Markdown/JSON state creation
- Planning and question lifecycle
- Handoff generation

### v0.2 (Multi-agent Context Delivery)
- Prompt builder per agent
- Adapter registry
- Checkpoint snapshots

### v0.3 (Execution and Validation)
- Optional direct execution via adapters
- Post-run state refresh
- Guardrails for changed files and acceptance criteria

### v0.4 (Extensibility)
- Custom skills/templates
- Multi-project profile support
- Git workflow integration

## Non-Goals (MVP)
- Local database persistence
- Complex UI dashboard
- Provider-specific deep API integrations
- Automatic autonomous coding without explicit task boundary

## Success Criteria
- A project can be initialized and planned using only files inside `./dev`.
- At least two distinct agent CLIs can consume equivalent operational context.
- Questions/decisions are traceable and versioned in Git.
- Handoff between agents preserves continuity without chat-memory dependence.
