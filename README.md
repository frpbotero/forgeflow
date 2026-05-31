# forgeflow-agent

ForgeFlow Agent is a file-first CLI orchestrator for multi-agent AI development workflows.

It creates and maintains shared project state in Markdown/JSON so Codex, Claude, Gemini, Copilot, or custom CLIs can collaborate with continuity.

## Install

Global install:

```bash
npm install -g forgeflow-agent
```

Run with npx:

```bash
npx forgeflow-agent init
```

During `init`, ForgeFlow asks which CLIs you want to enable (Codex, Claude, Gemini, Copilot, or custom command), allowing multi-selection.

## Usage

Initialize in a project:

```bash
forgeflow init \
  --agents codex,claude,gemini \
  --docs ./dev/docs \
  --specs ./dev/specs \
  --state ./dev/forgeflow \
  --cli codex \
  --stack angular,nest,pwa
```

You can also define a custom runtime command:

```bash
forgeflow init --cli custom --cli-cmd 'codex "{prompt}"'
```

You can enable multiple CLIs in one setup:

```bash
forgeflow init --cli codex,claude,copilot
```

Generate planning artifacts:

```bash
forgeflow plan
```

Check status:

```bash
forgeflow status
```

List questions:

```bash
forgeflow questions
```

Answer question:

```bash
forgeflow answer Q-001 "Use JWT with refresh tokens"
```

Generate handoff:

```bash
forgeflow handoff --to claude
```

Generate agent prompt:

```bash
forgeflow prompt --agent codex --task "Create Angular app shell"
```

Run agent CLI interactively:

```bash
forgeflow run --agent codex --task "Create Angular app shell"
```

Create checkpoint:

```bash
forgeflow checkpoint --name "initial planning"
```

## Commands

- `init`
- `configure`
- `plan`
- `status`
- `questions`
- `answer`
- `handoff`
- `prompt`
- `run`
- `checkpoint`
- `sync`

## Notes

- Source of truth is in `./dev/forgeflow`.
- MVP is file-first (Markdown/JSON), no local database.
- Works with Git versioning and PR review flows.

## License

MIT
