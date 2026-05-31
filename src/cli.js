import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import readline from 'node:readline/promises';
import { emitKeypressEvents } from 'node:readline';
import { parseArgs, csvToArray } from './core/args.js';
import { ensureDir, nowIso, slugify, writeFile } from './core/fs-utils.js';
import { defaultConfig, ensureBaseFiles, loadQuestions, loadState, renderQuestions, saveState } from './core/state.js';

const HELP = `forgeflow-agent v0.1.0

Usage:
  forgeflow <command> [options]

Commands:
  init                Initialize ForgeFlow in current project
  configure           Update configuration paths/agents/stack
  plan                Generate planning artifacts from docs/specs
  status              Show current project status
  questions           List open questions
  answer <id> <text>  Answer a question and record decision
  handoff --to <a>    Generate handoff for another agent
  prompt              Generate operational prompt for an agent task
  run                 Open selected CLI and run interactively with generated context
  checkpoint          Snapshot current state files
  sync                Recompute quick counters from files
  help                Show this help
`;

export async function runCli(argv) {
  const cwd = process.cwd();
  const [command = 'help', ...rest] = argv;
  const { positionals, flags } = parseArgs(rest);

  switch (command) {
    case 'init':
      return cmdInit(cwd, flags);
    case 'configure':
      return cmdConfigure(cwd, flags);
    case 'plan':
      return cmdPlan(cwd, flags);
    case 'status':
      return cmdStatus(cwd, flags);
    case 'questions':
      return cmdQuestions(cwd, flags);
    case 'answer':
      return cmdAnswer(cwd, positionals, flags);
    case 'handoff':
      return cmdHandoff(cwd, flags);
    case 'prompt':
      return cmdPrompt(cwd, flags);
    case 'run':
      return cmdRun(cwd, flags);
    case 'checkpoint':
      return cmdCheckpoint(cwd, flags);
    case 'sync':
      return cmdSync(cwd, flags);
    case 'help':
    default:
      console.log(HELP);
  }
}

async function cmdInit(cwd, flags) {
  const cfg = defaultConfig(cwd);

  const agents = csvToArray(flags.agents);
  const stack = csvToArray(flags.stack).map((x) => x.toLowerCase());

  if (agents.length > 0) cfg.configuredAgents = agents;
  if (flags.docs) cfg.paths.docs = flags.docs;
  if (flags.specs) cfg.paths.specs = flags.specs;
  if (flags.skills) cfg.paths.skills = flags.skills;
  if (flags.state) cfg.paths.state = flags.state;
  if (flags.agentsPath) cfg.paths.agents = flags.agentsPath;

  cfg.stack.angular = stack.includes('angular');
  cfg.stack.pwa = stack.includes('pwa');
  cfg.stack.nestjs = stack.includes('nest') || stack.includes('nestjs');

  const runtime = await resolveRuntimeConfig(flags);
  cfg.agentRuntime.cli = runtime.defaultCli;
  cfg.agentRuntime.commandTemplate = runtime.defaultCommandTemplate;
  cfg.agentRuntime.runtimes = runtime.runtimes;
  if (agents.length === 0 && runtime.selectedClis.length > 0) {
    cfg.configuredAgents = runtime.selectedClis;
  }

  const dirs = ensureBaseFiles(cwd, cfg);
  console.log('[forgeflow] Project initialized.');
  console.log(`[forgeflow] State: ${dirs.stateDir}`);
  console.log(`[forgeflow] CLIs selecionados: ${cfg.configuredAgents.join(', ')}`);
  console.log(`[forgeflow] CLI runtime padrão: ${cfg.agentRuntime.commandTemplate}`);
}

function cmdConfigure(cwd, flags) {
  const { statePath, state } = loadState(cwd, flags.state || './dev/forgeflow');

  if (flags.docs) state.paths.docs = flags.docs;
  if (flags.specs) state.paths.specs = flags.specs;
  if (flags.skills) state.paths.skills = flags.skills;
  if (flags.agentsPath) state.paths.agents = flags.agentsPath;

  const agents = csvToArray(flags.agents);
  if (agents.length) state.configuredAgents = agents;

  const stack = csvToArray(flags.stack).map((x) => x.toLowerCase());
  if (stack.length) {
    state.stack.angular = stack.includes('angular');
    state.stack.pwa = stack.includes('pwa');
    state.stack.nestjs = stack.includes('nest') || stack.includes('nestjs');
  }

  if (flags.cli) {
    state.agentRuntime = state.agentRuntime || {};
    const selected = parseCliSelection(flags.cli);
    const selectedClis = selected.length ? selected : ['codex'];
    const runtimes = buildRuntimesConfig(selectedClis, flags['cli-cmd']);
    const defaultCli = selectedClis[0];
    state.agentRuntime.cli = defaultCli;
    state.agentRuntime.commandTemplate = runtimes[defaultCli].commandTemplate;
    state.agentRuntime.runtimes = runtimes;
    state.configuredAgents = selectedClis;
  }
  if (flags['cli-cmd']) {
    state.agentRuntime = state.agentRuntime || {};
    const customTemplate = String(flags['cli-cmd']).trim();
    const selectedClis = Object.keys(state.agentRuntime.runtimes || {}).length
      ? Object.keys(state.agentRuntime.runtimes)
      : [state.agentRuntime.cli || 'custom'];
    const runtimes = buildRuntimesConfig(selectedClis, customTemplate);
    const defaultCli = state.agentRuntime.cli || selectedClis[0] || 'custom';
    state.agentRuntime.cli = defaultCli;
    state.agentRuntime.commandTemplate = runtimes[defaultCli]?.commandTemplate || customTemplate;
    state.agentRuntime.runtimes = runtimes;
  }

  ensureBaseFiles(cwd, state);
  saveState(statePath, state, 'forgeflow-configure');
  console.log('[forgeflow] Configuration updated.');
}

function cmdPlan(cwd, flags) {
  const { statePath, state } = loadState(cwd, flags.state || './dev/forgeflow');
  const specsDir = path.resolve(cwd, state.paths.specs);
  const docsDir = path.resolve(cwd, state.paths.docs);
  const stateDir = path.resolve(cwd, state.paths.state);

  const specs = listMarkdownFiles(specsDir);
  const docs = listMarkdownFiles(docsDir);

  const planning = `# Project Planning\n\n## Goal\nBuild according to available docs/specs with shared multi-agent state.\n\n## Current Phase\nPlanning\n\n## Input Summary\n- Docs files: ${docs.length}\n- Specs files: ${specs.length}\n\n## Docs\n${docs.length ? docs.map((x) => `- ${x}`).join('\n') : '- None found'}\n\n## Specs\n${specs.length ? specs.map((x) => `- ${x}`).join('\n') : '- None found'}\n\n## Next Tasks\n1. Resolve pending questions.\n2. Confirm architecture decisions.\n3. Start implementation tasks per roadmap.\n`;

  const roadmap = `# Roadmap\n\n## Planning\n- Consolidate requirements from docs/specs\n- Clarify ambiguities in questions.md\n\n## Implementation\n- Build foundational modules for selected stack\n\n## Review\n- Run architecture and code quality review\n\n## Testing\n- Add unit/integration/e2e baseline\n\n## Handoff\n- Transfer context to selected next agent\n`;

  writeFile(path.join(stateDir, 'planning.md'), planning);
  writeFile(path.join(stateDir, 'roadmap.md'), roadmap);

  state.currentPhase = 'planning';
  state.status.planning = 'in_progress';
  saveState(statePath, state, 'forgeflow-plan');
  console.log('[forgeflow] Planning artifacts generated.');
}

function cmdStatus(cwd, flags) {
  const { state } = loadState(cwd, flags.state || './dev/forgeflow');
  const qPath = path.resolve(cwd, state.paths.state, 'questions.md');
  const questions = loadQuestions(qPath);

  console.log('ForgeFlow Status');
  console.log(`- Project: ${state.projectName}`);
  console.log(`- Phase: ${state.currentPhase}`);
  console.log(`- Active agent: ${state.activeAgent || 'none'}`);
  console.log(`- Configured agents: ${state.configuredAgents.join(', ')}`);
  console.log(`- Open questions: ${questions.filter((q) => q.status === 'pending_user_answer').length}`);
  console.log(`- State version: ${state.version}`);
  console.log(`- Updated at: ${state.updatedAt}`);
}

function cmdQuestions(cwd, flags) {
  const { state } = loadState(cwd, flags.state || './dev/forgeflow');
  const qPath = path.resolve(cwd, state.paths.state, 'questions.md');
  const questions = loadQuestions(qPath);
  const pending = questions.filter((q) => q.status === 'pending_user_answer');

  if (pending.length === 0) {
    console.log('No pending questions.');
    return;
  }

  console.log('Pending questions:\n');
  pending.forEach((q) => console.log(`[${q.id}] ${q.text}`));
}

function cmdAnswer(cwd, positionals, flags) {
  const id = positionals[0];
  const answerText = positionals.slice(1).join(' ').trim();

  if (!id || !answerText) {
    throw new Error('Usage: forgeflow answer <Q-001> "your answer"');
  }

  const { statePath, state } = loadState(cwd, flags.state || './dev/forgeflow');
  const stateDir = path.resolve(cwd, state.paths.state);
  const qPath = path.join(stateDir, 'questions.md');
  const dPath = path.join(stateDir, 'decisions.md');

  const questions = loadQuestions(qPath);
  const target = questions.find((q) => q.id === id);
  if (!target) {
    throw new Error(`Question ${id} not found in questions.md`);
  }

  target.status = 'answered';
  writeFile(qPath, renderQuestions(questions));

  const decisionBlock = `\n## ${id} - ${nowIso()}\nAnswer: ${answerText}\nSource: user\n`;
  fs.appendFileSync(dPath, decisionBlock, 'utf8');

  state.openQuestions = questions.filter((q) => q.status === 'pending_user_answer').length;
  saveState(statePath, state, 'forgeflow-answer');

  console.log(`[forgeflow] ${id} answered and recorded in decisions.md`);
}

function cmdHandoff(cwd, flags) {
  const to = flags.to;
  if (!to) throw new Error('Usage: forgeflow handoff --to <agent>');

  const { statePath, state } = loadState(cwd, flags.state || './dev/forgeflow');
  const stateDir = path.resolve(cwd, state.paths.state);

  const handoff = `# Handoff\n\n## Timestamp\n${nowIso()}\n\n## From\n${state.activeAgent || 'unknown'}\n\n## To\n${to}\n\n## Current Phase\n${state.currentPhase}\n\n## Required Reading\n1. ${state.paths.state}/project-state.json\n2. ${state.paths.state}/planning.md\n3. ${state.paths.state}/roadmap.md\n4. ${state.paths.state}/decisions.md\n5. ${state.paths.state}/questions.md\n\n## Notes\n- Continue from latest state version ${state.version}.\n- Do not make silent architecture decisions.\n`;

  writeFile(path.join(stateDir, 'handoff.md'), handoff);
  state.currentPhase = 'handoff';
  state.status.handoff = 'in_progress';
  state.activeAgent = to;
  saveState(statePath, state, 'forgeflow-handoff');

  console.log(`[forgeflow] Handoff generated for ${to}.`);
}

function cmdPrompt(cwd, flags) {
  const agent = flags.agent;
  const task = flags.task;
  if (!agent || !task) {
    throw new Error('Usage: forgeflow prompt --agent <name> --task "..."');
  }

  const { statePath, state } = loadState(cwd, flags.state || './dev/forgeflow');
  const stateDir = path.resolve(cwd, state.paths.state);
  const outDir = path.join(stateDir, 'generated');
  ensureDir(outDir);

  const prompt = buildPrompt(state, task);

  const outPath = path.join(outDir, `${slugify(agent)}-task.md`);
  writeFile(outPath, prompt);

  state.activeAgent = agent;
  state.currentPhase = 'implementation';
  state.status.implementation = 'in_progress';
  saveState(statePath, state, 'forgeflow-prompt');

  console.log(`[forgeflow] Prompt generated at ${outPath}`);
}

async function cmdRun(cwd, flags) {
  const { statePath, state } = loadState(cwd, flags.state || './dev/forgeflow');
  const agent = flags.agent || state.activeAgent || state.configuredAgents[0] || 'codex';
  const task = flags.task;
  if (!task) {
    throw new Error('Usage: forgeflow run --task "..." [--agent <name>]');
  }

  const prompt = buildPrompt(state, task);
  const stateDir = path.resolve(cwd, state.paths.state);
  const outDir = path.join(stateDir, 'generated');
  ensureDir(outDir);
  const outPath = path.join(outDir, `${slugify(agent)}-task.md`);
  writeFile(outPath, prompt);

  const runtimes = state.agentRuntime?.runtimes || {};
  const selectedRuntime = runtimes[agent] || runtimes[String(agent).toLowerCase()];
  const commandTemplate = String(selectedRuntime?.commandTemplate || state.agentRuntime?.commandTemplate || 'codex');
  const runtimeCommand = commandTemplate.includes('{prompt}')
    ? commandTemplate.replaceAll('{prompt}', shellEscape(prompt))
    : commandTemplate;

  console.log(`[forgeflow] Prompt generated at ${outPath}`);
  console.log(`[forgeflow] Launching interactive CLI: ${runtimeCommand}`);
  if (!commandTemplate.includes('{prompt}')) {
    console.log('[forgeflow] This CLI template does not inject the prompt automatically.');
    console.log('[forgeflow] Use the generated file above as your initial context.');
  }

  await runInteractiveCommand(runtimeCommand, cwd);

  state.activeAgent = agent;
  state.currentPhase = 'implementation';
  state.status.implementation = 'in_progress';
  saveState(statePath, state, 'forgeflow-run');
}

function cmdCheckpoint(cwd, flags) {
  const { state } = loadState(cwd, flags.state || './dev/forgeflow');
  const stateDir = path.resolve(cwd, state.paths.state);
  const checkpointsDir = path.join(stateDir, 'checkpoints');
  ensureDir(checkpointsDir);

  const existing = fs.readdirSync(checkpointsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).length;
  const number = String(existing + 1).padStart(4, '0');
  const rawName = flags.name || `checkpoint-${number}`;
  const cpName = `${number}-${slugify(rawName)}`;
  const cpDir = path.join(checkpointsDir, cpName);
  ensureDir(cpDir);

  const files = ['project-state.json', 'planning.md', 'roadmap.md', 'decisions.md', 'questions.md', 'handoff.md', 'execution-log.md'];
  for (const f of files) {
    const src = path.join(stateDir, f);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(cpDir, f));
    }
  }

  console.log(`[forgeflow] Checkpoint created: ${cpDir}`);
}

function cmdSync(cwd, flags) {
  const { statePath, state } = loadState(cwd, flags.state || './dev/forgeflow');
  const qPath = path.resolve(cwd, state.paths.state, 'questions.md');
  const questions = loadQuestions(qPath);
  state.openQuestions = questions.filter((q) => q.status === 'pending_user_answer').length;
  saveState(statePath, state, 'forgeflow-sync');
  console.log('[forgeflow] State synchronized from files.');
}

function buildPrompt(state, task) {
  return `# ForgeFlow Operating Context\n\nYou are an AI coding agent working inside a ForgeFlow-managed project.\n\n## Task\n${task}\n\n## Required Reading Order\n1. ${state.paths.state}/project-state.json\n2. ${state.paths.state}/planning.md\n3. ${state.paths.state}/roadmap.md\n4. ${state.paths.state}/decisions.md\n5. ${state.paths.state}/questions.md\n6. Relevant specs in ${state.paths.specs}\n7. Relevant skills in ${state.paths.skills}\n\n## Rules\n- Follow planning and decisions.\n- Register unclear requirements in questions.md.\n- Update execution-log.md and handoff.md at the end.\n`;
}

async function resolveRuntimeConfig(flags) {
  const cli = String(flags.cli || '').trim().toLowerCase();
  const cliCmd = String(flags['cli-cmd'] || '').trim();
  const selectedFromFlag = parseCliSelection(cli);
  if (selectedFromFlag.length > 0) {
    const runtimes = buildRuntimesConfig(selectedFromFlag, cliCmd);
    const defaultCli = selectedFromFlag[0];
    return {
      selectedClis: selectedFromFlag,
      defaultCli,
      defaultCommandTemplate: runtimes[defaultCli].commandTemplate,
      runtimes
    };
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    const runtimes = buildRuntimesConfig(['codex'], cliCmd);
    return {
      selectedClis: ['codex'],
      defaultCli: 'codex',
      defaultCommandTemplate: runtimes.codex.commandTemplate,
      runtimes
    };
  }

  const choices = ['codex', 'claude', 'gemini', 'copilot', 'custom'];
  const selected = await selectClisInteractive(choices);
  const selectedClis = selected.length ? selected : ['codex'];
  let customTemplate = cliCmd;
  if (selectedClis.includes('custom') && !customTemplate) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    customTemplate = (await rl.question('Informe o comando do CLI custom (aceita {prompt} como placeholder): ')).trim();
    rl.close();
  }
  const runtimes = buildRuntimesConfig(selectedClis, customTemplate);
  const defaultCli = selectedClis[0];
  return {
    selectedClis,
    defaultCli,
    defaultCommandTemplate: runtimes[defaultCli].commandTemplate,
    runtimes
  };
}

function cliDefaultTemplate(cli) {
  switch (cli) {
    case 'claude':
      return 'claude';
    case 'gemini':
      return 'gemini';
    case 'copilot':
      return 'github-copilot-cli';
    case 'codex':
      return 'codex';
    default:
      return 'codex';
  }
}

function parseCliSelection(value) {
  if (!value) return [];
  const valid = new Set(['codex', 'claude', 'gemini', 'copilot', 'custom']);
  const clis = String(value)
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .filter((item) => valid.has(item));
  return Array.from(new Set(clis));
}

function buildRuntimesConfig(clis, customCommand) {
  const runtimes = {};
  for (const cli of clis) {
    if (cli === 'custom') {
      runtimes.custom = {
        cli: 'custom',
        commandTemplate: String(customCommand || 'codex')
      };
      continue;
    }
    runtimes[cli] = {
      cli,
      commandTemplate: cliDefaultTemplate(cli)
    };
  }
  return runtimes;
}

async function selectClisInteractive(choices) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return ['codex'];
  }

  const labels = {
    codex: 'Codex',
    claude: 'Claude',
    gemini: 'Gemini',
    copilot: 'Copilot',
    custom: 'Custom'
  };
  const selected = new Set();
  let cursor = 0;

  emitKeypressEvents(process.stdin);
  const rawWasEnabled = process.stdin.isRaw;
  if (!rawWasEnabled) process.stdin.setRawMode(true);

  const render = () => {
    process.stdout.write('\x1Bc');
    process.stdout.write('Selecione os CLIs para habilitar no ForgeFlow\n');
    process.stdout.write('Use ↑/↓ para navegar, espaço para marcar, Enter para confirmar.\n\n');
    choices.forEach((cli, index) => {
      const pointer = index === cursor ? '>' : ' ';
      const mark = selected.has(cli) ? 'x' : ' ';
      process.stdout.write(`${pointer} [${mark}] ${labels[cli]}\n`);
    });
  };

  render();

  return await new Promise((resolve) => {
    const onKeyPress = (str, key) => {
      if (key?.name === 'up') {
        cursor = cursor === 0 ? choices.length - 1 : cursor - 1;
        render();
        return;
      }
      if (key?.name === 'down') {
        cursor = cursor === choices.length - 1 ? 0 : cursor + 1;
        render();
        return;
      }
      if (key?.name === 'space') {
        const current = choices[cursor];
        if (selected.has(current)) selected.delete(current);
        else selected.add(current);
        render();
        return;
      }
      if (key?.name === 'return' || key?.name === 'enter') {
        process.stdin.off('keypress', onKeyPress);
        if (!rawWasEnabled) process.stdin.setRawMode(false);
        process.stdout.write('\n');
        resolve(Array.from(selected));
        return;
      }
      if (key?.ctrl && key?.name === 'c') {
        process.stdin.off('keypress', onKeyPress);
        if (!rawWasEnabled) process.stdin.setRawMode(false);
        process.stdout.write('\n');
        process.exit(130);
      }
      if (str && str.length === 1) {
        const quick = str.toLowerCase();
        const idx = choices.findIndex((cli) => cli[0] === quick);
        if (idx >= 0) {
          cursor = idx;
          const current = choices[cursor];
          if (selected.has(current)) selected.delete(current);
          else selected.add(current);
          render();
        }
      }
    };

    process.stdin.on('keypress', onKeyPress);
  });
}

function shellEscape(text) {
  return `"${String(text).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function runInteractiveCommand(command, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      cwd,
      stdio: 'inherit',
      shell: true
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Agent CLI exited with code ${code}`));
    });
  });
}

function listMarkdownFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.toLowerCase().endsWith('.md'))
    .map((d) => d.name)
    .sort();
}
