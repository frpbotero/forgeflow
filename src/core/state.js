import path from 'node:path';
import fs from 'node:fs';
import { ensureDir, nowIso, readFileIfExists, writeFile } from './fs-utils.js';

export function defaultConfig(cwd) {
  return {
    projectName: path.basename(cwd),
    configuredAgents: ['codex'],
    activeAgent: null,
    paths: {
      docs: './dev/docs',
      specs: './dev/specs',
      skills: './dev/skills',
      state: './dev/forgeflow',
      agents: './dev/agents'
    },
    stack: {
      angular: false,
      pwa: false,
      nestjs: false
    },
    agentRuntime: {
      cli: 'codex',
      commandTemplate: 'codex'
    },
    currentPhase: 'init',
    status: {
      planning: 'pending',
      implementation: 'pending',
      review: 'pending',
      testing: 'pending',
      handoff: 'pending'
    },
    openQuestions: 0,
    lastRuntimeUsed: 'codex',
    lastUpdatedBy: 'forgeflow',
    version: 1,
    updatedAt: nowIso()
  };
}

export function resolveStatePath(cwd, stateDir) {
  return path.resolve(cwd, stateDir, 'project-state.json');
}

export function loadState(cwd, stateDir = './dev/forgeflow') {
  const statePath = resolveStatePath(cwd, stateDir);
  if (!fs.existsSync(statePath)) {
    throw new Error(`State not found at ${statePath}. Run \`forgeflow init\` first.`);
  }

  return {
    statePath,
    state: JSON.parse(fs.readFileSync(statePath, 'utf8'))
  };
}

export function saveState(statePath, state, updater = 'forgeflow') {
  const next = {
    ...state,
    version: Number(state.version || 0) + 1,
    updatedAt: nowIso(),
    lastUpdatedBy: updater
  };
  writeFile(statePath, JSON.stringify(next, null, 2) + '\n');
  return next;
}

export function ensureBaseFiles(cwd, config) {
  const docsDir = path.resolve(cwd, config.paths.docs);
  const specsDir = path.resolve(cwd, config.paths.specs);
  const skillsDir = path.resolve(cwd, config.paths.skills);
  const stateDir = path.resolve(cwd, config.paths.state);
  const agentsDir = path.resolve(cwd, config.paths.agents);

  [docsDir, specsDir, skillsDir, stateDir, agentsDir].forEach(ensureDir);

  writeFile(path.join(stateDir, 'planning.md'), planningTemplate(config));
  writeFile(path.join(stateDir, 'roadmap.md'), roadmapTemplate());
  writeFile(path.join(stateDir, 'decisions.md'), decisionsTemplate());
  writeFile(path.join(stateDir, 'questions.md'), questionsTemplate());
  writeFile(path.join(stateDir, 'execution-log.md'), executionLogTemplate());
  writeFile(path.join(stateDir, 'handoff.md'), handoffTemplate());
  writeFile(path.join(stateDir, 'context.md'), contextTemplate(config));

  writeFile(path.join(stateDir, 'project-state.json'), JSON.stringify(config, null, 2) + '\n');

  config.configuredAgents.forEach((agent) => {
    writeFile(path.join(agentsDir, `${agent}.md`), agentTemplate(agent, config));
  });

  return {
    docsDir,
    specsDir,
    skillsDir,
    stateDir,
    agentsDir
  };
}

export function loadQuestions(questionsPath) {
  const raw = readFileIfExists(questionsPath);
  if (!raw) return [];
  const lines = raw.split('\n');
  const questions = [];

  for (const line of lines) {
    const match = line.match(/^- \[(Q-\d+)\] \(([^)]+)\) (.+)$/);
    if (match) {
      questions.push({ id: match[1], status: match[2], text: match[3] });
    }
  }

  return questions;
}

export function renderQuestions(questions) {
  const header = '# Open Questions\n\n';
  if (questions.length === 0) {
    return `${header}No pending questions.\n`;
  }

  return `${header}${questions.map((q) => `- [${q.id}] (${q.status}) ${q.text}`).join('\n')}\n`;
}

function planningTemplate(config) {
  return `# Project Planning\n\n## Goal\nDefine and execute the project using ForgeFlow shared state.\n\n## Current Phase\n${config.currentPhase}\n\n## Functional Requirements\n- Define from /dev/specs\n\n## Technical Requirements\n- Define stack and architecture decisions\n\n## Open Questions\n- Add unresolved decisions in questions.md\n\n## Next Tasks\n1. Run \`forgeflow plan\`.\n2. Answer pending questions.\n3. Start implementation with \`forgeflow run\` or \`forgeflow prompt\`.\n`;
}

function roadmapTemplate() {
  return `# Roadmap\n\n## Phase 1: Planning\n- Consolidate docs and specs\n- Define architecture\n\n## Phase 2: Implementation\n- Build frontend/backend foundation\n\n## Phase 3: Review and Testing\n- Run quality and security checks\n\n## Phase 4: Handoff\n- Prepare context for next agent\n`;
}

function decisionsTemplate() {
  return '# Decisions\n\n';
}

function questionsTemplate() {
  return '# Open Questions\n\nNo pending questions.\n';
}

function executionLogTemplate() {
  return '# Execution Log\n\n';
}

function handoffTemplate() {
  return '# Handoff\n\n';
}

function contextTemplate(config) {
  return `# ForgeFlow Context\n\n## Source of Truth\n- ${config.paths.state}/project-state.json\n- ${config.paths.state}/planning.md\n- ${config.paths.state}/roadmap.md\n- ${config.paths.state}/decisions.md\n- ${config.paths.state}/questions.md\n\n## Rules\n- Do not rely on chat memory only.\n- Register missing requirements as questions.\n- Update state files after major changes.\n`;
}

function agentTemplate(agent, config) {
  return `# ${agent[0].toUpperCase()}${agent.slice(1)} Agent Instructions\n\nYou are working inside a ForgeFlow-managed project.\n\nBefore making changes:\n1. Read \`${config.paths.state}/context.md\`.\n2. Read \`${config.paths.state}/planning.md\`.\n3. Read \`${config.paths.state}/decisions.md\`.\n4. Read relevant specs in \`${config.paths.specs}\`.\n5. Check \`${config.paths.state}/questions.md\`.\n\nAfter completing work:\n1. Update \`${config.paths.state}/execution-log.md\`.\n2. Update \`${config.paths.state}/project-state.json\`.\n3. Add risks to \`${config.paths.state}/handoff.md\`.\n`;
}
