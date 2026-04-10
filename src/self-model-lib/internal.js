const fs = require("node:fs");
const path = require("node:path");
const { parseFrontmatter, renderMarkdown, sectionContent, stripMarkdownFormatting, toWikiLink } = require("../markdown");
const { ensureProjectStructure, listMarkdownNotes } = require("../project");
const { nowIso, readText, relativeToRoot, slugify, truncate, writeJson, writeText } = require("../utils");

const SELF_SCHEMA_REGISTRY = {
  constitution: {
    folder: "constitution",
    kind: "constitution-note",
    defaultRuleStrength: "hard",
    defaultApplicability: ["global"],
    defaultCommandScope: ["global"],
    defaultTimeHorizon: "strategic"
  },
  mode: {
    folder: "modes",
    kind: "mode-note",
    defaultRuleStrength: "default",
    defaultApplicability: ["global"],
    defaultCommandScope: ["global"],
    defaultTimeHorizon: "strategic"
  },
  preference: {
    folder: "preferences",
    kind: "preference-note",
    defaultRuleStrength: "soft",
    defaultApplicability: ["writing"],
    defaultCommandScope: ["global"],
    defaultTimeHorizon: "execution"
  },
  bias: {
    folder: "bias-watch",
    kind: "bias-watch-note",
    defaultRuleStrength: "hard",
    defaultApplicability: ["global"],
    defaultCommandScope: ["global"],
    defaultTimeHorizon: "strategic"
  },
  "anti-pattern": {
    folder: "anti-patterns",
    kind: "anti-pattern-note",
    defaultRuleStrength: "hard",
    defaultApplicability: ["global"],
    defaultCommandScope: ["global"],
    defaultTimeHorizon: "strategic"
  },
  heuristic: {
    folder: "heuristics",
    kind: "heuristic-note",
    defaultRuleStrength: "default",
    defaultApplicability: ["investment"],
    defaultCommandScope: ["global"],
    defaultTimeHorizon: "tactical"
  },
  "decision-rule": {
    folder: "decision-rules",
    kind: "decision-rule-note",
    defaultRuleStrength: "hard",
    defaultApplicability: ["investment"],
    defaultCommandScope: ["global"],
    defaultTimeHorizon: "execution"
  },
  "communication-style": {
    folder: "communication-style",
    kind: "communication-style-note",
    defaultRuleStrength: "soft",
    defaultApplicability: ["writing"],
    defaultCommandScope: ["global"],
    defaultTimeHorizon: "execution"
  },
  "portfolio-philosophy": {
    folder: "portfolio-philosophy",
    kind: "portfolio-philosophy-note",
    defaultRuleStrength: "hard",
    defaultApplicability: ["investment"],
    defaultCommandScope: ["global"],
    defaultTimeHorizon: "strategic"
  },
  postmortem: {
    folder: "postmortems",
    kind: "postmortem-note",
    defaultRuleStrength: "hard",
    defaultApplicability: ["global"],
    defaultCommandScope: ["global"],
    defaultTimeHorizon: "tactical"
  }
};

const LEGACY_FOLDER_TO_SCHEMA = {
  principles: "constitution",
  heuristics: "heuristic",
  "anti-patterns": "anti-pattern",
  "decision-rules": "decision-rule",
  "portfolio-philosophy": "portfolio-philosophy",
  postmortems: "postmortem",
  "bias-watch": "bias",
  "communication-style": "communication-style",
  constitution: "constitution",
  modes: "mode",
  preferences: "preference"
};

const LEGACY_TYPE_TO_SCHEMA = {
  auto: "auto",
  principles: "constitution",
  principle: "constitution",
  heuristics: "heuristic",
  heuristic: "heuristic",
  "anti-patterns": "anti-pattern",
  "anti-pattern": "anti-pattern",
  "decision-rules": "decision-rule",
  "decision-rule": "decision-rule",
  "portfolio-philosophy": "portfolio-philosophy",
  postmortems: "postmortem",
  postmortem: "postmortem",
  "bias-watch": "bias",
  bias: "bias",
  "communication-style": "communication-style",
  communication: "communication-style",
  constitution: "constitution",
  mode: "mode",
  preference: "preference"
};

const RULE_STRENGTH_RANK = {
  soft: 1,
  default: 2,
  hard: 3
};

const SOURCE_BASIS_RANK = {
  declared: 1,
  "learned-from-history": 2,
  "learned-from-postmortem": 3
};

const KNOWN_APPLICABILITY = ["global", "investment", "macro", "valuation", "trading", "writing", "coding"];
const KNOWN_COMMANDS = [
  "ask",
  "report",
  "decision-note",
  "meeting-brief",
  "red-team",
  "reflect",
  "principles",
  "state-refresh",
  "regime-brief",
  "watch",
  "surveil",
  "deck",
  "what-changed-for-markets",
  "why-believe",
  "postmortem",
  "frontier-pack",
  "capture-report",
  "capture-authored",
  "capture-frontier"
];

const GENERATED_SELF_NOTE_PATTERNS = [
  /^wiki\/self\/(?:README|index|tension-register|current-operating-constitution)\.md$/i,
  /^wiki\/self\/mode-profiles\//i
];

const DEFAULT_COMMAND_APPLICABILITY = {
  ask: ["global", "writing"],
  report: ["investment", "macro", "valuation", "writing"],
  "decision-note": ["investment", "macro", "valuation", "writing"],
  "meeting-brief": ["investment", "macro", "valuation", "writing"],
  "red-team": ["investment", "macro", "valuation", "writing"],
  "state-refresh": ["investment", "macro", "valuation", "writing"],
  "regime-brief": ["investment", "macro", "valuation", "writing"],
  "what-changed-for-markets": ["investment", "macro", "writing"],
  "why-believe": ["investment", "macro", "valuation", "writing"],
  deck: ["investment", "macro", "writing"],
  surveil: ["investment", "macro", "writing"],
  watch: ["investment", "macro", "writing"],
  reflect: ["global", "writing"],
  principles: ["global", "writing"],
  postmortem: ["global", "writing"],
  "frontier-pack": ["investment", "macro", "valuation", "writing"]
};

const DIRECTIVE_HEADINGS = {
  constitution: ["Principle Statement", "Decision Contract", "Operating Constitution", "Rule"],
  mode: ["Mode", "Operating Mode", "Mode Profile", "Principle Statement"],
  preference: ["Preference", "Preference Statement", "Preferred Output Style"],
  bias: ["Mitigation", "Observed Bias / Tendency", "Bias"],
  "anti-pattern": ["Better Alternative", "Anti-Pattern", "Why It Fails"],
  heuristic: ["Heuristic", "Rule of Thumb", "When It Helps"],
  "decision-rule": ["Decision Rule", "Sizing Rule", "Heuristic", "Principle Statement"],
  "communication-style": ["Preferred Output Style", "Good Challenge Style"],
  "portfolio-philosophy": ["Principle Statement", "Portfolio Philosophy", "Mechanism"],
  postmortem: ["Lessons", "What Was Wrong", "Decision"]
};

const AVOIDANCE_HEADINGS = {
  constitution: ["Common Objections", "What Would Falsify It"],
  mode: ["Failure Modes", "What To Avoid"],
  preference: ["What To Avoid", "Failure Modes"],
  bias: ["Observed Bias / Tendency", "Mitigation"],
  "anti-pattern": ["Anti-Pattern", "Why It Fails"],
  heuristic: ["Failure Modes", "Counterpoints"],
  "decision-rule": ["Failure Modes", "Counterpoints"],
  "communication-style": ["What To Avoid"],
  "portfolio-philosophy": ["When It Fails", "Common Objections"],
  postmortem: ["What Was Wrong", "Lessons"]
};

function normalizeList(value) {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry).trim()).filter(Boolean);
  }
  return String(value)
    .split(/[;,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function clampPriority(value, fallback = 3) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.max(1, Math.min(5, Math.round(number)));
}

function normalizeSchema(value, fallback = "constitution") {
  const normalized = String(value || "").trim().toLowerCase();
  return LEGACY_TYPE_TO_SCHEMA[normalized] || (SELF_SCHEMA_REGISTRY[normalized] ? normalized : fallback);
}

function normalizeRuleStrength(value, fallback = "default") {
  const normalized = String(value || "").trim().toLowerCase();
  return RULE_STRENGTH_RANK[normalized] ? normalized : fallback;
}

function normalizeTimeHorizon(value, fallback = "strategic") {
  const normalized = String(value || "").trim().toLowerCase();
  return ["strategic", "tactical", "execution"].includes(normalized) ? normalized : fallback;
}

function normalizeConfidence(value, fallback = "medium") {
  const normalized = String(value || "").trim().toLowerCase();
  return ["low", "medium", "high"].includes(normalized) ? normalized : fallback;
}

function normalizeSourceBasis(value, fallback = "declared") {
  const normalized = String(value || "").trim().toLowerCase();
  return SOURCE_BASIS_RANK[normalized] ? normalized : fallback;
}

function normalizeApplicability(value, fallback = ["global"]) {
  const normalized = normalizeList(value)
    .map((entry) => String(entry).trim().toLowerCase())
    .map((entry) => (entry === "all" ? "global" : entry))
    .filter((entry) => KNOWN_APPLICABILITY.includes(entry));
  return normalized.length ? [...new Set(normalized)] : fallback;
}

function normalizeCommandScope(value, fallback = ["global"]) {
  const normalized = normalizeList(value)
    .map((entry) => String(entry).trim().toLowerCase())
    .map((entry) => (["all", "*"].includes(entry) ? "global" : entry))
    .filter((entry) => entry === "global" || KNOWN_COMMANDS.includes(entry));
  return normalized.length ? [...new Set(normalized)] : fallback;
}

function firstMeaningfulSection(body, headings) {
  for (const heading of headings || []) {
    const content = sectionContent(body, heading);
    if (content) {
      return stripMarkdownFormatting(content).replace(/\s+/g, " ").trim();
    }
  }
  return "";
}

function summarizeBody(body, fallbackTitle = "") {
  const stripped = stripMarkdownFormatting(String(body || "")).replace(/\s+/g, " ").trim();
  const withoutTitle = fallbackTitle
    ? stripped.replace(new RegExp(`^${fallbackTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`), "").trim()
    : stripped;
  return truncate(withoutTitle || stripped, 220);
}

function noteFolderFromPath(relativePath) {
  return relativePath.split("/").slice(2, 3)[0] || "other";
}

function inferSchemaFromText(filePath, content, frontmatter = {}) {
  const explicit = normalizeSchema(frontmatter.schema || "", "");
  if (explicit) {
    return explicit;
  }

  const lower = `${path.basename(filePath)}\n${content}`.toLowerCase();
  if (lower.includes("postmortem") || lower.includes("what went wrong")) {
    return "postmortem";
  }
  if (lower.includes("bias") || lower.includes("blind spot")) {
    return "bias";
  }
  if (lower.includes("anti-pattern") || lower.includes("avoid this")) {
    return "anti-pattern";
  }
  if (lower.includes("communication") || lower.includes("tone") || lower.includes("how to write")) {
    return "communication-style";
  }
  if (lower.includes("decision rule") || lower.includes("sizing rule")) {
    return "decision-rule";
  }
  if (lower.includes("portfolio") || lower.includes("diversification") || lower.includes("satellite")) {
    return "portfolio-philosophy";
  }
  if (lower.includes("heuristic") || lower.includes("rule of thumb") || lower.includes("when in doubt")) {
    return "heuristic";
  }
  if (lower.includes("preference")) {
    return "preference";
  }
  if (lower.includes("mode")) {
    return "mode";
  }
  return "constitution";
}

function inferSelfNoteSchema(filePath, content, frontmatter = {}, options = {}) {
  if (options.schema) {
    return normalizeSchema(options.schema);
  }
  if (options.type && options.type !== "auto") {
    return normalizeSchema(options.type);
  }
  if (frontmatter.schema) {
    return normalizeSchema(frontmatter.schema);
  }
  const relativePath = String(options.relativePath || "").replace(/\\/g, "/");
  if (relativePath) {
    const folder = noteFolderFromPath(relativePath);
    if (LEGACY_FOLDER_TO_SCHEMA[folder]) {
      return LEGACY_FOLDER_TO_SCHEMA[folder];
    }
  }
  return inferSchemaFromText(filePath, content, frontmatter);
}

function schemaConfig(schema) {
  return SELF_SCHEMA_REGISTRY[normalizeSchema(schema)] || SELF_SCHEMA_REGISTRY.constitution;
}

function isGeneratedSelfNote(relativePath) {
  return GENERATED_SELF_NOTE_PATTERNS.some((pattern) => pattern.test(relativePath));
}

function topicApplicabilityHints(topic) {
  const text = String(topic || "").toLowerCase();
  const hints = [];
  if (/trade|trading|entry|exit|stop|second leg|breakout|setup|momentum/.test(text)) {
    hints.push("trading");
  }
  if (/macro|regime|inflation|rates|yield|oil|energy|geopolitical|growth|recession/.test(text)) {
    hints.push("macro");
  }
  if (/valuation|wacc|dcf|multiple|terminal value|intrinsic value/.test(text)) {
    hints.push("valuation");
  }
  if (/code|coding|repo|refactor|test|implementation|bug/.test(text)) {
    hints.push("coding");
  }
  return [...new Set(hints)];
}

function determineApplicability(command, topic = "", explicit = []) {
  const base = explicit.length ? explicit : DEFAULT_COMMAND_APPLICABILITY[command] || ["global", "writing"];
  return [...new Set(base.concat(topicApplicabilityHints(topic)).concat(["global"]))];
}

function commandSpecificity(note, command) {
  return note.commandScope.includes(command) ? 2 : note.commandScope.includes("global") ? 1 : 0;
}

function applicabilitySpecificity(note, applicability) {
  const exact = applicability.some((entry) => entry !== "global" && note.applicability.includes(entry));
  if (exact) {
    return 2;
  }
  return note.applicability.includes("global") ? 1 : 0;
}

function matchesContext(note, context) {
  if (["inactive", "obsolete", "retired", "superseded"].includes(String(note.status || "").toLowerCase())) {
    return false;
  }
  const globalCommandContext = !context.command || context.command === "global";
  if (!(globalCommandContext || note.commandScope.includes("global") || note.commandScope.includes(context.command))) {
    return false;
  }
  return note.applicability.includes("global") || context.applicability.some((entry) => note.applicability.includes(entry));
}

function noteReferenceKeys(note) {
  return new Set(
    [
      note.id,
      note.title,
      slugify(note.title),
      note.relativePath,
      path.basename(note.relativePath, ".md"),
      path.basename(note.relativePath)
    ]
      .map((value) => String(value || "").trim().toLowerCase())
      .filter(Boolean)
  );
}

function findNoteByReference(notes, reference) {
  const normalizedReference = String(reference || "").trim().toLowerCase();
  if (!normalizedReference) {
    return null;
  }
  return notes.find((note) => noteReferenceKeys(note).has(normalizedReference)) || null;
}

function extractAvoidances(note) {
  const extracted = [];
  for (const heading of AVOIDANCE_HEADINGS[note.schema] || []) {
    const content = sectionContent(note.body, heading);
    const cleaned = stripMarkdownFormatting(content).replace(/\s+/g, " ").trim();
    if (cleaned) {
      extracted.push(truncate(cleaned, 180));
    }
  }
  return [...new Set(extracted.concat((note.examplesBad || []).map((entry) => truncate(entry, 180)).filter(Boolean)))].slice(0, 4);
}

function summarizeRule(note) {
  return {
    id: note.id,
    title: note.title,
    schema: note.schema,
    priority: note.priority,
    rule_strength: note.ruleStrength,
    applicability: note.applicability,
    command_scope: note.commandScope,
    time_horizon: note.timeHorizon,
    confidence: note.confidence,
    source_basis: note.sourceBasis,
    directive: note.directive,
    avoidances: note.avoidances,
    examples_good: note.examplesGood,
    examples_bad: note.examplesBad,
    review_trigger: note.reviewTrigger,
    relative_path: note.relativePath
  };
}

function compareNotes(left, right, context) {
  const leftPriority = clampPriority(left.priority, 3);
  const rightPriority = clampPriority(right.priority, 3);
  if (leftPriority !== rightPriority) {
    return {
      winner: leftPriority > rightPriority ? left : right,
      loser: leftPriority > rightPriority ? right : left,
      reason: "higher priority"
    };
  }

  const leftStrength = RULE_STRENGTH_RANK[left.ruleStrength] || RULE_STRENGTH_RANK.default;
  const rightStrength = RULE_STRENGTH_RANK[right.ruleStrength] || RULE_STRENGTH_RANK.default;
  if (leftStrength !== rightStrength) {
    return {
      winner: leftStrength > rightStrength ? left : right,
      loser: leftStrength > rightStrength ? right : left,
      reason: "hard rule outranks softer rule"
    };
  }

  const leftCommand = commandSpecificity(left, context.command);
  const rightCommand = commandSpecificity(right, context.command);
  if (leftCommand !== rightCommand) {
    return {
      winner: leftCommand > rightCommand ? left : right,
      loser: leftCommand > rightCommand ? right : left,
      reason: "exact command scope outranks global scope"
    };
  }

  const leftApplicability = applicabilitySpecificity(left, context.applicability);
  const rightApplicability = applicabilitySpecificity(right, context.applicability);
  if (leftApplicability !== rightApplicability) {
    return {
      winner: leftApplicability > rightApplicability ? left : right,
      loser: leftApplicability > rightApplicability ? right : left,
      reason: "exact applicability outranks generic scope"
    };
  }

  const leftBasis = SOURCE_BASIS_RANK[left.sourceBasis] || SOURCE_BASIS_RANK.declared;
  const rightBasis = SOURCE_BASIS_RANK[right.sourceBasis] || SOURCE_BASIS_RANK.declared;
  if (leftBasis !== rightBasis) {
    return {
      winner: leftBasis > rightBasis ? left : right,
      loser: leftBasis > rightBasis ? right : left,
      reason: "learned rule outranks purely declared rule"
    };
  }

  return {
    winner: left.title.localeCompare(right.title) <= 0 ? left : right,
    loser: left.title.localeCompare(right.title) <= 0 ? right : left,
    reason: "stable tie-breaker"
  };
}

function collectConflictPairs(notes) {
  const pairs = [];
  const seen = new Set();

  for (const note of notes) {
    const references = []
      .concat((note.conflictsWith || []).map((reference) => ({ reference, relation: "conflicts_with" })))
      .concat((note.supersedes || []).map((reference) => ({ reference, relation: "supersedes" })));

    for (const entry of references) {
      const target = findNoteByReference(notes, entry.reference);
      if (!target || target.relativePath === note.relativePath) {
        continue;
      }
      const key = [note.relativePath, target.relativePath].sort().join("::");
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      pairs.push({
        left: note,
        right: target,
        relation: entry.relation
      });
    }
  }

  return pairs;
}

function reviewAgeDays(note) {
  const lastTouched = note.reviewedAt || note.updatedAt || note.ingestedAt || note.createdAt || "";
  if (!lastTouched) {
    return 0;
  }
  const timestamp = Date.parse(lastTouched);
  if (!Number.isFinite(timestamp)) {
    return 0;
  }
  return Math.floor((Date.now() - timestamp) / (1000 * 60 * 60 * 24));
}

function renderRuleLines(rules) {
  if (!rules.length) {
    return "- None active.";
  }
  return rules
    .map((rule) => {
      const detail = rule.directive || rule.title;
      return `- ${rule.title}: ${detail}`;
    })
    .join("\n");
}

function renderWhatNotToDo(lines) {
  if (!lines.length) {
    return "- No explicit exclusions are active yet.";
  }
  return lines.map((line) => `- ${line}`).join("\n");
}

function renderConflictLines(conflicts) {
  if (!conflicts.length) {
    return "- No declared self-rule conflicts are active in this context.";
  }
  return conflicts
    .map((conflict) => `- ${conflict.winner_title} overrides ${conflict.loser_title} here because ${conflict.reason}.`)
    .join("\n");
}

function renderReviewLines(entries) {
  if (!entries.length) {
    return "- No stale review candidates surfaced for this context.";
  }
  return entries
    .map((entry) => `- ${entry.title}: ${entry.review_trigger} (${entry.days_since_review} days since review).`)
    .join("\n");
}

function resolveNotesForContext(notes, context) {
  const matched = notes.filter((note) => matchesContext(note, context));
  const suppress = new Set();
  const conflicts = [];

  for (const pair of collectConflictPairs(matched)) {
    const resolved = compareNotes(pair.left, pair.right, context);
    suppress.add(resolved.loser.relativePath);
    conflicts.push({
      key: [pair.left.relativePath, pair.right.relativePath].sort().join("::"),
      relation: pair.relation,
      winner_title: resolved.winner.title,
      winner_path: resolved.winner.relativePath,
      loser_title: resolved.loser.title,
      loser_path: resolved.loser.relativePath,
      reason: resolved.reason
    });
  }

  const selected = matched
    .filter((note) => !suppress.has(note.relativePath))
    .sort((left, right) => {
      const priorityDelta = clampPriority(right.priority, 3) - clampPriority(left.priority, 3);
      if (priorityDelta) {
        return priorityDelta;
      }
      const strengthDelta = (RULE_STRENGTH_RANK[right.ruleStrength] || 0) - (RULE_STRENGTH_RANK[left.ruleStrength] || 0);
      if (strengthDelta) {
        return strengthDelta;
      }
      return left.title.localeCompare(right.title);
    });

  const activeHardRules = selected
    .filter((note) => note.ruleStrength === "hard" && !["bias", "anti-pattern"].includes(note.schema))
    .map(summarizeRule);
  const activeSoftPreferences = selected
    .filter((note) => note.ruleStrength !== "hard" && !["bias", "anti-pattern"].includes(note.schema))
    .map(summarizeRule);
  const challengeStyle = selected
    .filter((note) => ["communication-style", "constitution", "preference"].includes(note.schema))
    .map(summarizeRule)
    .slice(0, 6);
  const biasChecks = selected
    .filter((note) => ["bias", "anti-pattern", "postmortem"].includes(note.schema))
    .map(summarizeRule)
    .slice(0, 8);
  const writingConstraints = selected
    .filter((note) => note.applicability.includes("writing") || ["communication-style", "preference"].includes(note.schema))
    .map(summarizeRule)
    .slice(0, 8);
  const whatNotToDo = [...new Set(selected.filter((note) => note.schema !== "bias").flatMap((note) => note.avoidances || []))].slice(0, 10);
  const learnedFromPostmortems = selected
    .filter((note) => note.sourceBasis === "learned-from-postmortem" || note.schema === "postmortem")
    .map(summarizeRule);
  const staleReview = selected
    .filter((note) => note.reviewTrigger && reviewAgeDays(note) >= 180)
    .map((note) => ({
      title: note.title,
      relative_path: note.relativePath,
      review_trigger: note.reviewTrigger,
      days_since_review: reviewAgeDays(note)
    }))
    .slice(0, 8);

  return {
    command: context.command,
    topic: context.topic || "",
    applicability: context.applicability,
    activeHardRules,
    activeSoftPreferences,
    challengeStyle,
    biasChecks,
    writingConstraints,
    whatNotToDo,
    learnedFromPostmortems,
    staleReview,
    conflicts,
    sourceNotes: selected.map((note) => ({
      title: note.title,
      schema: note.schema,
      relative_path: note.relativePath
    }))
  };
}

function renderSelfModelMarkdownBlock(context, options = {}) {
  const title = options.title || "Active Self-Model";
  const activeHardRules = context.activeHardRules || context.active_hard_rules || [];
  const activeSoftPreferences = context.activeSoftPreferences || context.active_soft_preferences || [];
  const challengeStyle = context.challengeStyle || context.challenge_style || [];
  const biasChecks = context.biasChecks || context.bias_checks || [];
  const writingConstraints = context.writingConstraints || context.writing_constraints || [];
  const whatNotToDo = context.whatNotToDo || context.what_not_to_do || [];
  const conflicts = context.conflicts || [];
  const staleReview = context.staleReview || context.stale_review || [];
  return `## ${title}

### Active Hard Rules

${renderRuleLines(activeHardRules)}

### Active Soft Preferences

${renderRuleLines(activeSoftPreferences)}

### Challenge Style

${renderRuleLines(challengeStyle)}

### Bias Checks

${renderRuleLines(biasChecks)}

### Writing Constraints

${renderRuleLines(writingConstraints)}

### What Not To Do

${renderWhatNotToDo(whatNotToDo)}

### Active Tensions

${renderConflictLines(conflicts)}

### Review Queue

${renderReviewLines(staleReview)}
`;
}

function renderSourceMap(notes) {
  if (!notes.length) {
    return "- No self-model source notes are active yet.";
  }
  return notes.map((note) => `- ${toWikiLink(note.relative_path, note.title)} (${note.schema})`).join("\n");
}

function serializeSelfModelContext(context) {
  return {
    command: context.command,
    topic: context.topic,
    applicability: context.applicability,
    active_hard_rules: context.activeHardRules,
    active_soft_preferences: context.activeSoftPreferences,
    challenge_style: context.challengeStyle,
    bias_checks: context.biasChecks,
    writing_constraints: context.writingConstraints,
    what_not_to_do: context.whatNotToDo,
    learned_from_postmortems: context.learnedFromPostmortems,
    stale_review: context.staleReview,
    conflicts: context.conflicts,
    source_notes: context.sourceNotes
  };
}

function buildModeProfileMarkdown(title, context) {
  return `
# ${title}

## Command Scope

- Derived for command context: ${context.command}
- Applicability: ${context.applicability.join(", ")}

${renderSelfModelMarkdownBlock(context, { title: "Active Rules" })}

## Learned From Postmortems

${renderRuleLines(context.learnedFromPostmortems)}

## Source Map

${renderSourceMap(context.sourceNotes)}
`;
}

function buildConstitutionMarkdown(compiled) {
  return `
# Current Operating Constitution

## Executive Summary

- Structured self notes: ${compiled.noteCount}
- Declared conflicts surfaced: ${compiled.conflicts.length}
- Commands covered: ${Object.keys(compiled.activeByCommand).length}

${renderSelfModelMarkdownBlock(compiled.globalContext)}

## Learned From Postmortems

${renderRuleLines(compiled.globalContext.learnedFromPostmortems)}

## Source Map

${renderSourceMap(compiled.globalContext.sourceNotes)}
`;
}

function buildTensionRegisterMarkdown(compiled) {
  return `
# Tension Register

## Managed Reflection

- Last updated: ${nowIso()}

${renderConflictLines(compiled.conflicts)}

## Review Queue

${renderReviewLines(compiled.globalContext.staleReview)}
`;
}

function defaultGlobalContext(notes) {
  return resolveNotesForContext(notes, {
    command: "global",
    topic: "current operating constitution",
    applicability: ["global", "investment", "macro", "valuation", "trading", "writing", "coding"]
  });
}

function loadSelfNotes(root) {
  ensureProjectStructure(root);
  return listMarkdownNotes(root, "wiki/self")
    .map((filePath) => {
      const relativePath = relativeToRoot(root, filePath);
      if (isGeneratedSelfNote(relativePath)) {
        return null;
      }
      const raw = readText(filePath);
      const parsed = parseFrontmatter(raw);
      const category = noteFolderFromPath(relativePath);
      const schema = inferSelfNoteSchema(filePath, raw, parsed.frontmatter, { relativePath });
      const config = schemaConfig(schema);
      const frontmatter = parsed.frontmatter;
      const directive = truncate(
        firstMeaningfulSection(parsed.body, DIRECTIVE_HEADINGS[schema]) ||
          summarizeBody(parsed.body, frontmatter.title || path.basename(filePath, ".md")),
        220
      );
      const note = {
        path: filePath,
        relativePath,
        frontmatter,
        body: parsed.body,
        rawContent: raw,
        title: frontmatter.title || path.basename(filePath, ".md"),
        category,
        schema,
        kind: frontmatter.kind || config.kind,
        status: frontmatter.status || "active",
        priority: clampPriority(frontmatter.priority, schema === "constitution" ? 4 : 3),
        ruleStrength: normalizeRuleStrength(frontmatter.rule_strength, config.defaultRuleStrength),
        applicability: normalizeApplicability(frontmatter.applicability, config.defaultApplicability),
        commandScope: normalizeCommandScope(frontmatter.command_scope, config.defaultCommandScope),
        timeHorizon: normalizeTimeHorizon(frontmatter.time_horizon, config.defaultTimeHorizon),
        confidence: normalizeConfidence(frontmatter.confidence, "medium"),
        supersedes: normalizeList(frontmatter.supersedes),
        conflictsWith: normalizeList(frontmatter.conflicts_with),
        examplesGood: normalizeList(frontmatter.examples_good),
        examplesBad: normalizeList(frontmatter.examples_bad),
        reviewTrigger: String(frontmatter.review_trigger || "").trim(),
        sourceBasis: normalizeSourceBasis(frontmatter.source_basis, "declared"),
        ingestedAt: String(frontmatter.ingested_at || frontmatter.created_at || "").trim(),
        createdAt: String(frontmatter.created_at || "").trim(),
        updatedAt: String(frontmatter.updated_at || "").trim(),
        reviewedAt: String(frontmatter.reviewed_at || "").trim(),
        directive
      };
      note.avoidances = extractAvoidances(note);
      return note;
    })
    .filter(Boolean);
}

function buildCompiledSelfModel(root) {
  const notes = loadSelfNotes(root);
  const activeByCommand = {};
  for (const command of KNOWN_COMMANDS) {
    activeByCommand[command] = resolveNotesForContext(notes, {
      command,
      topic: "",
      applicability: determineApplicability(command)
    });
  }

  const globalContext = defaultGlobalContext(notes);
  const modeProfiles = {
    "investment-research": resolveNotesForContext(notes, {
      command: "report",
      topic: "investment research",
      applicability: ["investment", "macro", "valuation", "writing", "global"]
    }),
    trading: resolveNotesForContext(notes, {
      command: "decision-note",
      topic: "trading",
      applicability: ["trading", "writing", "global"]
    }),
    communication: resolveNotesForContext(notes, {
      command: "ask",
      topic: "communication",
      applicability: ["writing", "global"]
    })
  };

  const conflictMap = new Map();
  for (const context of [globalContext, ...Object.values(activeByCommand), ...Object.values(modeProfiles)]) {
    for (const conflict of context.conflicts) {
      if (!conflictMap.has(conflict.key)) {
        conflictMap.set(conflict.key, conflict);
      }
    }
  }

  return {
    generatedAt: nowIso(),
    noteCount: notes.length,
    notes: notes.map((note) => ({
      id: note.id,
      title: note.title,
      schema: note.schema,
      kind: note.kind,
      priority: note.priority,
      rule_strength: note.ruleStrength,
      applicability: note.applicability,
      command_scope: note.commandScope,
      time_horizon: note.timeHorizon,
      confidence: note.confidence,
      source_basis: note.sourceBasis,
      supersedes: note.supersedes,
      conflicts_with: note.conflictsWith,
      review_trigger: note.reviewTrigger,
      relative_path: note.relativePath,
      directive: note.directive,
      avoidances: note.avoidances
    })),
    conflicts: [...conflictMap.values()],
    globalContext,
    activeByCommand,
    modeProfiles
  };
}

function compileSelfModelArtifacts(root) {
  ensureProjectStructure(root);
  const compiled = buildCompiledSelfModel(root);
  const manifest = {
    generated_at: compiled.generatedAt,
    note_count: compiled.noteCount,
    notes: compiled.notes,
    conflicts: compiled.conflicts,
    active_by_command: Object.fromEntries(
      Object.entries(compiled.activeByCommand).map(([command, context]) => [
        command,
        {
          applicability: context.applicability,
          active_hard_rules: context.activeHardRules,
          active_soft_preferences: context.activeSoftPreferences,
          challenge_style: context.challengeStyle,
          bias_checks: context.biasChecks,
          writing_constraints: context.writingConstraints,
          what_not_to_do: context.whatNotToDo,
          conflicts: context.conflicts,
          stale_review: context.staleReview
        }
      ])
    ),
    mode_profiles: Object.fromEntries(
      Object.entries(compiled.modeProfiles).map(([name, context]) => [
        name,
        {
          applicability: context.applicability,
          active_hard_rules: context.activeHardRules,
          active_soft_preferences: context.activeSoftPreferences,
          challenge_style: context.challengeStyle,
          bias_checks: context.biasChecks,
          writing_constraints: context.writingConstraints,
          what_not_to_do: context.whatNotToDo,
          conflicts: context.conflicts,
          stale_review: context.staleReview
        }
      ])
    )
  };

  writeJson(path.join(root, "manifests", "self_model.json"), manifest);
  writeText(
    path.join(root, "wiki", "self", "current-operating-constitution.md"),
    renderMarkdown(
      {
        id: "SELF-CONSTITUTION-CURRENT",
        kind: "constitution-summary",
        title: "Current Operating Constitution",
        status: "active",
        generated_at: compiled.generatedAt,
        self_note_count: compiled.noteCount,
        conflict_count: compiled.conflicts.length
      },
      buildConstitutionMarkdown(compiled)
    )
  );

  for (const [name, context] of Object.entries(compiled.modeProfiles)) {
    const title = name
      .split("-")
      .map((entry) => entry.charAt(0).toUpperCase() + entry.slice(1))
      .join(" ");
    writeText(
      path.join(root, "wiki", "self", "mode-profiles", `${name}.md`),
      renderMarkdown(
        {
          id: `SELF-MODE-${slugify(name).toUpperCase().slice(0, 12)}`,
          kind: "mode-profile",
          title,
          status: "active",
          generated_at: compiled.generatedAt
        },
        buildModeProfileMarkdown(title, context)
      )
    );
  }

  writeText(
    path.join(root, "wiki", "self", "tension-register.md"),
    renderMarkdown(
      {
        id: "SELF-TENSION-REGISTER",
        kind: "reflection-note",
        title: "Tension Register",
        status: "active",
        generated_at: compiled.generatedAt
      },
      buildTensionRegisterMarkdown(compiled)
    )
  );

  return {
    noteCount: compiled.noteCount,
    conflictCount: compiled.conflicts.length,
    modeProfiles: Object.keys(compiled.modeProfiles)
  };
}

function resolveSelfModelContext(root, options = {}) {
  const notes = loadSelfNotes(root);
  const command = String(options.command || "ask").trim().toLowerCase() || "ask";
  const topic = String(options.topic || "").trim();
  const explicitApplicability = normalizeApplicability(options.applicability || [], []);
  return resolveNotesForContext(notes, {
    command,
    topic,
    applicability: determineApplicability(command, topic, explicitApplicability)
  });
}

module.exports = {
  SELF_SCHEMA_REGISTRY,
  buildCompiledSelfModel,
  compileSelfModelArtifacts,
  inferSelfNoteSchema,
  loadSelfNotes,
  normalizeSchema,
  renderSelfModelMarkdownBlock,
  resolveSelfModelContext,
  serializeSelfModelContext,
  schemaConfig
};
