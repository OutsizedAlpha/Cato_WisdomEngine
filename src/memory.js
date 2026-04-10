const fs = require("node:fs");
const path = require("node:path");
const { parseFrontmatter, renderMarkdown, sectionContent, stripMarkdownFormatting, toWikiLink } = require("./markdown");
const { ensureProjectStructure } = require("./project");
const { writeOutputByFamily } = require("./research");
const { renderSelfModelMarkdownBlock, resolveSelfModelContext, serializeSelfModelContext } = require("./self-model");
const {
  appendJsonl,
  dateStamp,
  ensureDir,
  nowIso,
  readJson,
  readJsonl,
  readText,
  relativeToRoot,
  slugify,
  writeJson,
  writeText
} = require("./utils");

const IGNORED_MEMORY_COMMANDS = new Set([
  "help",
  "memory-status",
  "memory-refresh",
  "capture-memory",
  "doctor",
  "lint",
  "search",
  "watch-list",
  "claim-diff",
  "state-diff"
]);

function handoffCore() {
  return require("./handoff-core");
}

function memoryPaths(root) {
  return {
    eventsPath: path.join(root, "manifests", "memory_events.jsonl"),
    statePath: path.join(root, "manifests", "memory_state.json"),
    currentContextPath: path.join(root, "wiki", "memory", "current-context.md"),
    currentContextRelativePath: "wiki/memory/current-context.md",
    memoryIndexPath: path.join(root, "wiki", "memory", "index.md"),
    memoryMirrorPath: path.join(root, "MEMORY.md"),
    dailyDir: path.join(root, "wiki", "memory", "daily"),
    weeklyDir: path.join(root, "wiki", "memory", "weekly"),
    actionsLogPath: path.join(root, "logs", "actions", "memory_refresh.jsonl")
  };
}

function defaultMemoryState() {
  return {
    version: 1,
    current_context: {
      last_captured_date: "",
      last_capture_at: "",
      pending_date: "",
      pending_pack_path: "",
      pending_prompt_path: "",
      pending_capture_path: ""
    },
    weekly_review: {
      last_captured_week: "",
      last_capture_at: "",
      pending_week: "",
      pending_pack_path: "",
      pending_prompt_path: "",
      pending_capture_path: ""
    }
  };
}

function loadMemoryState(root) {
  const state = readJson(memoryPaths(root).statePath, defaultMemoryState());
  return {
    ...defaultMemoryState(),
    ...(state || {}),
    current_context: {
      ...defaultMemoryState().current_context,
      ...((state || {}).current_context || {})
    },
    weekly_review: {
      ...defaultMemoryState().weekly_review,
      ...((state || {}).weekly_review || {})
    }
  };
}

function saveMemoryState(root, state) {
  writeJson(memoryPaths(root).statePath, {
    ...defaultMemoryState(),
    ...(state || {}),
    current_context: {
      ...defaultMemoryState().current_context,
      ...((state || {}).current_context || {})
    },
    weekly_review: {
      ...defaultMemoryState().weekly_review,
      ...((state || {}).weekly_review || {})
    }
  });
}

function loadMemoryEvents(root) {
  return readJsonl(memoryPaths(root).eventsPath, []);
}

function asDate(value) {
  return value instanceof Date ? value : new Date(value || Date.now());
}

function isoWeekStart(dateInput) {
  const date = new Date(asDate(dateInput));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function isoWeekKey(dateInput) {
  const date = new Date(asDate(dateInput));
  const working = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  working.setUTCDate(working.getUTCDate() + 4 - (working.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(working.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((working - yearStart) / 86400000) + 1) / 7);
  return `${working.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function dailyNoteRelativePath(dateValue) {
  return `wiki/memory/daily/${dateValue}.md`;
}

function weeklyReviewSlug(weekStart) {
  return `weekly-review-${weekStart}`;
}

function weeklyReviewRelativePath(weekStart) {
  return `wiki/memory/weekly/${weeklyReviewSlug(weekStart)}.md`;
}

function timestampTime(isoValue) {
  const match = String(isoValue || "").match(/T(\d{2}:\d{2})/);
  return match ? match[1] : "";
}

function uniqueLocalSources(entries) {
  const seen = new Set();
  const output = [];
  for (const entry of entries) {
    if (!entry?.path) {
      continue;
    }
    const key = String(entry.path).replace(/\\/g, "/");
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push({
      path: key,
      title: entry.title || path.basename(key, path.extname(key)),
      role: entry.role || "context"
    });
  }
  return output;
}

function makeLocalSource(pathValue, title, role) {
  if (!pathValue) {
    return null;
  }
  return {
    path: String(pathValue).replace(/\\/g, "/"),
    title: title || path.basename(String(pathValue), path.extname(String(pathValue))),
    role: role || "context"
  };
}

function latestWeeklyReview(root) {
  const weeklyDir = memoryPaths(root).weeklyDir;
  if (!fs.existsSync(weeklyDir)) {
    return null;
  }
  const candidates = fs
    .readdirSync(weeklyDir)
    .filter((name) => name.toLowerCase().endsWith(".md") && !/^(index|readme)\.md$/i.test(name))
    .sort()
    .reverse();
  if (!candidates.length) {
    return null;
  }
  const relativePath = path.join("wiki", "memory", "weekly", candidates[0]).replace(/\\/g, "/");
  const parsed = parseFrontmatter(readText(path.join(root, relativePath)));
  return {
    relativePath,
    title: parsed.frontmatter.title || path.basename(relativePath, ".md")
  };
}

function recentDailyLogs(root, limit = 7) {
  const dailyDir = memoryPaths(root).dailyDir;
  if (!fs.existsSync(dailyDir)) {
    return [];
  }
  return fs
    .readdirSync(dailyDir)
    .filter((name) => /^\d{4}-\d{2}-\d{2}\.md$/i.test(name))
    .sort()
    .reverse()
    .slice(0, limit)
    .map((name) => {
      const relativePath = path.join("wiki", "memory", "daily", name).replace(/\\/g, "/");
      const parsed = parseFrontmatter(readText(path.join(root, relativePath)));
      return {
        relativePath,
        title: parsed.frontmatter.title || path.basename(name, ".md"),
        date: path.basename(name, ".md")
      };
    });
}

function workingMemoryLocalSources(root, options = {}) {
  const sources = [];
  const paths = memoryPaths(root);
  if (fs.existsSync(paths.currentContextPath)) {
    sources.push(makeLocalSource(paths.currentContextRelativePath, "Current Context", "working-memory"));
  }
  const latestWeekly = latestWeeklyReview(root);
  if (latestWeekly) {
    sources.push(makeLocalSource(latestWeekly.relativePath, latestWeekly.title, "working-memory"));
  }
  if (options.includeDaily) {
    const recentDaily = recentDailyLogs(root, Number(options.dailyLimit || 2));
    for (const entry of recentDaily) {
      sources.push(makeLocalSource(entry.relativePath, entry.title, "daily-memory"));
    }
  }
  return uniqueLocalSources(sources);
}

function summarizeArtifacts(artifacts) {
  if (!artifacts.length) {
    return "";
  }
  return artifacts
    .slice(0, 4)
    .map((value) => `\`${value}\``)
    .join(", ");
}

function buildMemoryEvent(command, parsed, result, options = {}) {
  if (!command || IGNORED_MEMORY_COMMANDS.has(command)) {
    return null;
  }

  const now = asDate(options.now);
  const event = {
    at: now.toISOString(),
    date: dateStamp(now),
    command,
    topic: "",
    summary: "",
    artifacts: [],
    counts: {}
  };
  const positionals = Array.isArray(parsed?.positionals) ? parsed.positionals : [];
  const joined = positionals.join(" ").trim();

  switch (command) {
    case "ingest":
      event.summary = `Ingested ${Number(result?.ingested || 0)} file(s) into the knowledge base.`;
      event.artifacts = (result?.results || []).slice(0, 6).map((record) => record.note_path).filter(Boolean);
      event.counts.ingested = Number(result?.ingested || 0);
      break;
    case "self-ingest":
      event.summary = `Ingested ${Number(result?.ingested || 0)} self-note(s) into the self-model corpus.`;
      event.counts.ingested = Number(result?.ingested || 0);
      break;
    case "compile":
      event.summary = "Recompiled maintained knowledge surfaces across notes, claims, states, and indices.";
      event.counts.source_notes = Number(result?.sourceNotes || 0);
      break;
    case "pdf-pack":
      event.summary = `Prepared a PDF vision pack for ${Number(result?.documents || 0)} document(s).`;
      event.artifacts = [result?.packPath, result?.promptPath, result?.capturePath].filter(Boolean);
      break;
    case "capture-pdf":
      event.summary = `Captured PDF handoff output and ingested ${Number(result?.ingested || 0)} document(s).`;
      event.artifacts = (result?.ingestedResults || []).slice(0, 6).map((record) => record.note_path).filter(Boolean);
      break;
    case "capture-research":
      event.summary = `Captured research handoff and ingested ${Number(result?.ingested || 0)} source(s).`;
      event.artifacts = [result?.outputResult?.outputPath]
        .concat((result?.ingestedResults || []).map((record) => record.note_path))
        .filter(Boolean);
      break;
    case "frontier-pack":
      event.topic = String(result?.topic || joined || "").trim();
      event.summary = `Prepared a frontier pack${event.topic ? ` for ${event.topic}` : ""}.`;
      event.artifacts = [result?.packPath, result?.promptPath, result?.capturePath].filter(Boolean);
      break;
    case "capture-frontier":
      event.summary = `Captured frontier-authored output${result?.outputResult?.outputPath ? ` to ${result.outputResult.outputPath}` : ""}.`;
      event.artifacts = [result?.outputResult?.outputPath, result?.outputResult?.promotedPath].filter(Boolean);
      break;
    case "capture-authored":
      event.summary = `Captured authored output${result?.outputResult?.outputPath ? ` to ${result.outputResult.outputPath}` : ""}.`;
      event.artifacts = [result?.outputResult?.outputPath, result?.outputResult?.promotedPath].filter(Boolean);
      break;
    case "report":
      event.topic = String(result?.topic || joined || "").trim();
      event.summary = `Prepared a report pack${event.topic ? ` for ${event.topic}` : ""}.`;
      event.artifacts = [result?.packPath, result?.promptPath, result?.capturePath, result?.canonicalPath].filter(Boolean);
      break;
    case "capture-report":
      event.summary = `Captured a canonical report${result?.outputResult?.outputPath ? ` to ${result.outputResult.outputPath}` : ""}.`;
      event.artifacts = [result?.outputResult?.outputPath, result?.outputResult?.archivedPath].filter(Boolean);
      break;
    case "ask":
    case "deck":
    case "surveil":
    case "watch":
    case "why-believe":
    case "state-refresh":
    case "regime-brief":
    case "meeting-brief":
    case "decision-note":
    case "red-team":
    case "what-changed-for-markets":
    case "reflect":
    case "principles":
    case "postmortem":
      event.topic = joined;
      event.summary = `Prepared a ${command} authored pack${event.topic ? ` for ${event.topic}` : ""}.`;
      event.artifacts = [result?.packPath, result?.promptPath, result?.capturePath, result?.outputPath].filter(Boolean);
      break;
    case "watch-refresh":
      event.summary = `Refreshed watch surveillance${result?.reportPath ? ` and wrote ${result.reportPath}` : ""}.`;
      event.artifacts = [result?.reportPath].concat(result?.refreshed?.map((entry) => entry.notePath) || []).filter(Boolean);
      break;
    case "claims-refresh":
      event.summary = `Refreshed the claim ledger with ${Number(result?.claims || 0)} claim(s).`;
      event.artifacts = [result?.snapshotPath, result?.diffReportPath].filter(Boolean);
      event.counts.claims = Number(result?.claims || 0);
      break;
    default:
      return null;
  }

  if (!event.summary) {
    return null;
  }
  event.artifacts = [...new Set(event.artifacts.filter(Boolean))];
  return event;
}

function groupEventCommands(events) {
  return [...new Set(events.map((event) => event.command))].sort();
}

function writeDailyMemoryLog(root, dateValue) {
  ensureProjectStructure(root);
  const events = loadMemoryEvents(root).filter((event) => event.date === dateValue);
  const commands = groupEventCommands(events);
  const output = writeOutputByFamily(root, "daily-memory-log", {
    title: `Daily Memory - ${dateValue}`,
    fileSlug: dateValue,
    outputPath: dailyNoteRelativePath(dateValue),
    frontmatter: {
      status: "active",
      date: dateValue,
      event_count: events.length,
      commands
    },
    body: `
# Daily Memory - ${dateValue}

## Summary

- Events recorded: ${events.length}
- Commands touched: ${commands.length ? commands.join(", ") : "none"}

## Timeline

${events.length ? events.map((event) => `- ${timestampTime(event.at)} ${event.command}: ${event.summary}${event.artifacts.length ? ` (${summarizeArtifacts(event.artifacts)})` : ""}`).join("\n") : "- No events recorded yet."}

## Artefacts

${events.flatMap((event) => event.artifacts).length ? [...new Set(events.flatMap((event) => event.artifacts))].map((value) => `- \`${value}\``).join("\n") : "- No tracked artefacts yet."}
`
  });
  return {
    outputPath: output.outputPath,
    eventCount: events.length,
    commands
  };
}

function recordWorkingMemoryEvent(root, event) {
  if (!event) {
    return null;
  }
  ensureProjectStructure(root);
  appendJsonl(memoryPaths(root).eventsPath, event);
  const daily = writeDailyMemoryLog(root, event.date);
  buildWorkingMemoryIndex(root);
  return {
    event,
    daily
  };
}

function extractCurrentContextSections(root) {
  const currentPath = memoryPaths(root).currentContextPath;
  if (!fs.existsSync(currentPath)) {
    return {};
  }
  const parsed = parseFrontmatter(readText(currentPath));
  const headings = [
    "Executive Orientation",
    "What Changed Recently",
    "Active Priorities",
    "Active Corpora / Themes",
    "Open Loops",
    "Watchpoints",
    "Memory Hygiene / Next Refresh"
  ];
  const sections = {};
  for (const heading of headings) {
    const content = sectionContent(parsed.body, heading);
    if (content) {
      sections[heading] = content.replace(/\s+/g, " ").trim().slice(0, 600);
    }
  }
  return sections;
}

function currentContextTemplate(dateValue) {
  return `# Current Context

## Executive Orientation

Replace this placeholder with the model-authored current operating context.

## What Changed Recently

## Active Priorities

## Active Corpora / Themes

## Open Loops

## Watchpoints

## Memory Hygiene / Next Refresh

- Memory date: ${dateValue}
`;
}

function weeklyReviewTemplate(weekKey, weekStart) {
  return `# Weekly Review - ${weekKey}

## Weekly View

Replace this placeholder with the model-authored weekly review.

## What Compounded

## What Friction Recurred

## What Changed In The Corpus

## Process Adjustments / Kaizen

## Open Questions Next Week

## Next Refresh

- Week key: ${weekKey}
- Week start: ${weekStart}
`;
}

function dailyEventDigest(events, limit = 12) {
  return events.slice(-limit).map((event) => ({
    at: event.at,
    command: event.command,
    summary: event.summary,
    topic: event.topic || "",
    artifacts: event.artifacts || []
  }));
}

function baseMemoryLocalSources() {
  return uniqueLocalSources([
    makeLocalSource("docs/project_brief.md", "Project Brief", "project-memory"),
    makeLocalSource("docs/project_map.md", "Project Map", "project-memory"),
    makeLocalSource("tasks/todo.md", "Todo", "project-memory"),
    makeLocalSource("tasks/lessons.md", "Lessons", "project-memory"),
    makeLocalSource("wiki/self/current-operating-constitution.md", "Current Operating Constitution", "self-model")
  ]);
}

function memoryMirrorBody(parsed, latestWeekly) {
  const stripped = String(parsed.body || "").replace(/^#\s+.+$/m, "").trim();
  return `# Memory

This file mirrors the latest compiled working-memory snapshot for Cato.

- Canonical current context: ${toWikiLink("wiki/memory/current-context.md", "Current Context")}
- Latest weekly review: ${latestWeekly ? toWikiLink(latestWeekly.relativePath, latestWeekly.title) : "None yet."}

${stripped || "No working-memory snapshot has been captured yet."}
`;
}

function syncMemoryMirror(root) {
  const paths = memoryPaths(root);
  if (!fs.existsSync(paths.currentContextPath)) {
    return "";
  }
  const parsed = parseFrontmatter(readText(paths.currentContextPath));
  const latestWeekly = latestWeeklyReview(root);
  writeText(paths.memoryMirrorPath, memoryMirrorBody(parsed, latestWeekly));
  return relativeToRoot(root, paths.memoryMirrorPath);
}

function workingMemoryStatus(root, options = {}) {
  ensureProjectStructure(root);
  const now = asDate(options.now);
  const today = dateStamp(now);
  const weekKey = isoWeekKey(now);
  const state = loadMemoryState(root);
  const currentExists = fs.existsSync(memoryPaths(root).currentContextPath);
  const weeklyExists = Boolean(latestWeeklyReview(root));
  const eventsToday = loadMemoryEvents(root).filter((event) => event.date === today).length;

  const currentPending = state.current_context.pending_date === today && Boolean(state.current_context.pending_capture_path);
  const weeklyPending = state.weekly_review.pending_week === weekKey && Boolean(state.weekly_review.pending_capture_path);
  const currentDue = !currentPending && (!currentExists || state.current_context.last_captured_date !== today);
  const weeklyDue = !weeklyPending && (!weeklyExists || state.weekly_review.last_captured_week !== weekKey);

  return {
    date: today,
    weekKey,
    eventsToday,
    currentContext: {
      due: currentDue,
      pending: currentPending,
      pendingCapturePath: state.current_context.pending_capture_path,
      lastCapturedDate: state.current_context.last_captured_date,
      lastCaptureAt: state.current_context.last_capture_at,
      outputPath: "wiki/memory/current-context.md",
      reason: currentDue
        ? currentExists
          ? "current context has not been refreshed for today"
          : "current context does not exist yet"
        : currentPending
          ? "current context refresh is already queued"
          : "current context is current for today"
    },
    weeklyReview: {
      due: weeklyDue,
      pending: weeklyPending,
      pendingCapturePath: state.weekly_review.pending_capture_path,
      lastCapturedWeek: state.weekly_review.last_captured_week,
      lastCaptureAt: state.weekly_review.last_capture_at,
      reason: weeklyDue
        ? weeklyExists
          ? "weekly review has not been refreshed for the current ISO week"
          : "no weekly review exists yet"
        : weeklyPending
          ? "weekly review refresh is already queued"
          : "weekly review is current for this ISO week"
    }
  };
}

function buildWorkingMemoryIndex(root) {
  ensureProjectStructure(root);
  const paths = memoryPaths(root);
  const status = workingMemoryStatus(root);
  const daily = recentDailyLogs(root, 7);
  const weeklyDir = paths.weeklyDir;
  const weekly = fs.existsSync(weeklyDir)
    ? fs
        .readdirSync(weeklyDir)
        .filter((name) => name.toLowerCase().endsWith(".md") && !/^(index|readme)\.md$/i.test(name))
        .sort()
        .reverse()
        .slice(0, 8)
        .map((name) => {
          const relativePath = path.join("wiki", "memory", "weekly", name).replace(/\\/g, "/");
          const parsed = parseFrontmatter(readText(path.join(root, relativePath)));
          return {
            relativePath,
            title: parsed.frontmatter.title || path.basename(name, ".md")
          };
        })
    : [];

  const lines = [
    "# Working Memory Index",
    "",
    `Generated: ${nowIso()}`,
    "",
    "## Current Context",
    `- ${toWikiLink("wiki/memory/current-context.md", "Current Context")}`,
    `- Status: ${status.currentContext.reason}`,
    status.currentContext.pendingCapturePath ? `- Pending capture: \`${status.currentContext.pendingCapturePath}\`` : "",
    "",
    "## Weekly Reviews",
    ...(weekly.length ? weekly.map((entry) => `- ${toWikiLink(entry.relativePath, entry.title)}`) : ["- None yet."]),
    "",
    "## Daily Memory Logs",
    ...(daily.length ? daily.map((entry) => `- ${toWikiLink(entry.relativePath, entry.title)}`) : ["- None yet."]),
    ""
  ].filter(Boolean);

  writeText(paths.memoryIndexPath, `${lines.join("\n").trim()}\n`);
  return relativeToRoot(root, paths.memoryIndexPath);
}

function writeCurrentContextPack(root, status, state, options = {}) {
  const now = asDate(options.now);
  const today = dateStamp(now);
  const recentDaily = recentDailyLogs(root, 7);
  const recentEvents = loadMemoryEvents(root)
    .filter((event) => event.date >= dateStamp(new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000)))
    .sort((left, right) => String(left.at).localeCompare(String(right.at)));
  const latestWeekly = latestWeeklyReview(root);
  const selfModel = resolveSelfModelContext(root, {
    command: "reflect",
    topic: "working memory"
  });
  const localSources = uniqueLocalSources([
    ...baseMemoryLocalSources(),
    ...recentDaily.map((entry) => makeLocalSource(entry.relativePath, entry.title, "daily-memory")),
    makeLocalSource(memoryPaths(root).currentContextRelativePath, "Current Context", "working-memory"),
    latestWeekly ? makeLocalSource(latestWeekly.relativePath, latestWeekly.title, "working-memory") : null
  ]);
  const packSlug = slugify(`memory-current-context-${today}`) || "memory-current-context";

  const paths = handoffCore().writePackArtifacts(root, {
    cacheDir: path.join("cache", "memory-packs"),
    slugSeed: packSlug,
    pack(relativePaths) {
      return {
        generated_at: now.toISOString(),
        memory_refresh_type: "current_context",
        memory_date: today,
        refresh_basis: "first_meaningful_cato_use_when_due",
        pending_reason: status.currentContext.reason,
        recent_daily_logs: recentDaily,
        recent_events: dailyEventDigest(recentEvents),
        previous_context_sections: extractCurrentContextSections(root),
        latest_weekly_review: latestWeekly,
        self_model: serializeSelfModelContext(selfModel),
        local_sources: localSources,
        pack_path: relativePaths.packPath
      };
    },
    captureBundle(relativePaths) {
      return {
        mode: "memory_refresh",
        memory_refresh_type: "current_context",
        topic: "Current Context",
        pack_path: relativePaths.packPath,
        authoring_layer: "terminal_model",
        model: "",
        authoring_session: "",
        local_sources: localSources,
        sources: [],
        output: {
          kind: "memory-context",
          title: "Current Context",
          output_path: "wiki/memory/current-context.md",
          promote: false,
          generation_mode: "terminal_model_memory_context",
          frontmatter: {
            status: "active",
            memory_date: today,
            refresh_basis: "first_meaningful_cato_use_when_due"
          },
          body: currentContextTemplate(today)
        }
      };
    },
    promptMarkdown(relativePaths) {
      return `# Working Memory Refresh Prompt

Cato is the raw memory and grounding layer. The active terminal model must author the compiled current-context note.

## Objective

- Refresh type: current context
- Memory date: ${today}
- Capture bundle: \`${relativePaths.capturePath}\`

## Required Operating Rules

1. Read the pack JSON at \`${relativePaths.packPath}\`.
2. Review the local sources and the recent event digest before writing.
3. Produce a concise but useful working-memory snapshot of what matters now.
4. Replace the placeholder text in \`output.body\`.
5. Fill \`model\` with the active session label.
6. Finalise with:
   \`.\cato.cmd capture-memory "${relativePaths.capturePath}"\`

## Local Context Sources

${localSources.map((source) => `- \`${source.path}\` (${source.role})`).join("\n")}

${renderSelfModelMarkdownBlock(selfModel)}
`;
    },
    logFile: path.join("logs", "actions", "memory_refresh.jsonl"),
    logEntry(relativePaths) {
      return {
        event: "memory_pack",
        refresh_type: "current_context",
        memory_date: today,
        pack_path: relativePaths.packPath,
        prompt_path: relativePaths.promptPath,
        capture_path: relativePaths.capturePath
      };
    }
  });

  state.current_context.pending_date = today;
  state.current_context.pending_pack_path = paths.packPath;
  state.current_context.pending_prompt_path = paths.promptPath;
  state.current_context.pending_capture_path = paths.capturePath;

  return {
    scope: "current_context",
    date: today,
    packPath: paths.packPath,
    promptPath: paths.promptPath,
    capturePath: paths.capturePath
  };
}

function writeWeeklyReviewPack(root, status, state, options = {}) {
  const now = asDate(options.now);
  const weekKey = isoWeekKey(now);
  const weekStart = dateStamp(isoWeekStart(now));
  const recentDaily = recentDailyLogs(root, 7).reverse();
  const recentEvents = loadMemoryEvents(root)
    .filter((event) => event.at >= isoWeekStart(now).toISOString())
    .sort((left, right) => String(left.at).localeCompare(String(right.at)));
  const selfModel = resolveSelfModelContext(root, {
    command: "reflect",
    topic: "weekly review"
  });
  const localSources = uniqueLocalSources([
    ...baseMemoryLocalSources(),
    makeLocalSource("wiki/memory/current-context.md", "Current Context", "working-memory"),
    ...recentDaily.map((entry) => makeLocalSource(entry.relativePath, entry.title, "daily-memory"))
  ]);
  const packSlug = slugify(`memory-weekly-review-${weekStart}`) || "memory-weekly-review";

  const paths = handoffCore().writePackArtifacts(root, {
    cacheDir: path.join("cache", "memory-packs"),
    slugSeed: packSlug,
    pack(relativePaths) {
      return {
        generated_at: now.toISOString(),
        memory_refresh_type: "weekly_review",
        week_key: weekKey,
        week_start: weekStart,
        refresh_basis: "first_meaningful_cato_use_when_due",
        pending_reason: status.weeklyReview.reason,
        recent_daily_logs: recentDaily,
        recent_events: dailyEventDigest(recentEvents, 24),
        previous_context_sections: extractCurrentContextSections(root),
        self_model: serializeSelfModelContext(selfModel),
        local_sources: localSources,
        pack_path: relativePaths.packPath
      };
    },
    captureBundle(relativePaths) {
      return {
        mode: "memory_refresh",
        memory_refresh_type: "weekly_review",
        topic: `Weekly Review ${weekKey}`,
        pack_path: relativePaths.packPath,
        authoring_layer: "terminal_model",
        model: "",
        authoring_session: "",
        local_sources: localSources,
        sources: [],
        output: {
          kind: "weekly-review",
          title: `Weekly Review - ${weekKey}`,
          output_path: weeklyReviewRelativePath(weekStart),
          promote: false,
          generation_mode: "terminal_model_weekly_review",
          frontmatter: {
            status: "active",
            week_key: weekKey,
            week_start: weekStart
          },
          body: weeklyReviewTemplate(weekKey, weekStart)
        }
      };
    },
    promptMarkdown(relativePaths) {
      return `# Weekly Review Refresh Prompt

The active terminal model must author the weekly working-memory review from the grounded pack.

## Objective

- Refresh type: weekly review
- Week key: ${weekKey}
- Capture bundle: \`${relativePaths.capturePath}\`

## Required Operating Rules

1. Read the pack JSON at \`${relativePaths.packPath}\`.
2. Review the local sources and weekly event digest.
3. Write a sharp weekly review with useful process and priority judgement.
4. Replace the placeholder text in \`output.body\`.
5. Fill \`model\` with the active session label.
6. Finalise with:
   \`.\cato.cmd capture-memory "${relativePaths.capturePath}"\`

## Local Context Sources

${localSources.map((source) => `- \`${source.path}\` (${source.role})`).join("\n")}

${renderSelfModelMarkdownBlock(selfModel)}
`;
    },
    logFile: path.join("logs", "actions", "memory_refresh.jsonl"),
    logEntry(relativePaths) {
      return {
        event: "memory_pack",
        refresh_type: "weekly_review",
        week_key: weekKey,
        pack_path: relativePaths.packPath,
        prompt_path: relativePaths.promptPath,
        capture_path: relativePaths.capturePath
      };
    }
  });

  state.weekly_review.pending_week = weekKey;
  state.weekly_review.pending_pack_path = paths.packPath;
  state.weekly_review.pending_prompt_path = paths.promptPath;
  state.weekly_review.pending_capture_path = paths.capturePath;

  return {
    scope: "weekly_review",
    weekKey,
    packPath: paths.packPath,
    promptPath: paths.promptPath,
    capturePath: paths.capturePath
  };
}

function writeMemoryRefreshPack(root, options = {}) {
  ensureProjectStructure(root);
  const scope = String(options.scope || "all").trim().toLowerCase();
  const force = Boolean(options.force);
  const state = loadMemoryState(root);
  const status = workingMemoryStatus(root, options);
  const generated = [];

  if ((scope === "all" || scope === "current") && (force || status.currentContext.due)) {
    generated.push(writeCurrentContextPack(root, status, state, options));
  }
  if ((scope === "all" || scope === "weekly") && (force || status.weeklyReview.due)) {
    generated.push(writeWeeklyReviewPack(root, status, state, options));
  }

  saveMemoryState(root, state);
  buildWorkingMemoryIndex(root);

  return {
    generated,
    status: workingMemoryStatus(root, options)
  };
}

function handleWorkingMemoryAfterCommand(root, payload = {}) {
  const event = buildMemoryEvent(payload.command, payload.parsed, payload.result, payload.options);
  if (!event) {
    return {
      recorded: false,
      generated: [],
      status: null
    };
  }

  const recorded = recordWorkingMemoryEvent(root, event);
  const refresh = writeMemoryRefreshPack(root, {
    now: payload.options?.now,
    scope: "all",
    force: false
  });

  appendJsonl(memoryPaths(root).actionsLogPath, {
    event: "memory_automation",
    at: nowIso(),
    command: payload.command,
    recorded_event: event.summary,
    generated_packs: refresh.generated.map((entry) => ({
      scope: entry.scope,
      capture_path: entry.capturePath
    }))
  });

  return {
    recorded: true,
    event,
    daily: recorded?.daily || null,
    generated: refresh.generated,
    status: refresh.status
  };
}

function captureMemory(root, bundleInput, options = {}) {
  return handoffCore().captureTerminalModelBundle(root, bundleInput, {
    label: "Memory capture",
    generationMode: (bundle) => bundle.output?.generation_mode || "terminal_model_memory",
    placeholderChecks: [
      {
        test: (body) => /Replace this placeholder with the model-authored/i.test(body),
        message: "Memory capture bundle still contains the placeholder body. Replace it with the real model-authored memory output first."
      }
    ],
    captureOptions: options,
    afterCapture(bundle, captureResult, bundlePath) {
      const state = loadMemoryState(root);
      const refreshType = String(bundle.memory_refresh_type || "").trim().toLowerCase();
      const relativeBundlePath = relativeToRoot(root, path.isAbsolute(bundlePath) ? bundlePath : path.join(root, bundlePath));
      if (refreshType === "current_context") {
        const memoryDate = String(bundle.output?.frontmatter?.memory_date || bundle.memory_date || dateStamp()).trim();
        state.current_context.last_captured_date = memoryDate;
        state.current_context.last_capture_at = nowIso();
        if (state.current_context.pending_capture_path === relativeBundlePath) {
          state.current_context.pending_date = "";
          state.current_context.pending_pack_path = "";
          state.current_context.pending_prompt_path = "";
          state.current_context.pending_capture_path = "";
        }
      }
      if (refreshType === "weekly_review") {
        const weekKey = String(bundle.output?.frontmatter?.week_key || bundle.week_key || isoWeekKey(new Date())).trim();
        state.weekly_review.last_captured_week = weekKey;
        state.weekly_review.last_capture_at = nowIso();
        if (state.weekly_review.pending_capture_path === relativeBundlePath) {
          state.weekly_review.pending_week = "";
          state.weekly_review.pending_pack_path = "";
          state.weekly_review.pending_prompt_path = "";
          state.weekly_review.pending_capture_path = "";
        }
      }
      saveMemoryState(root, state);
      buildWorkingMemoryIndex(root);
      syncMemoryMirror(root);
      appendJsonl(memoryPaths(root).actionsLogPath, {
        event: "memory_capture",
        at: nowIso(),
        refresh_type: refreshType,
        output_path: captureResult.outputResult?.outputPath || ""
      });
    },
    logFile: path.join("logs", "actions", "memory_refresh.jsonl"),
    logEvent: "memory_capture",
    logFields(bundle) {
      return {
        refresh_type: bundle.memory_refresh_type || "",
        topic: bundle.topic || ""
      };
    }
  });
}

module.exports = {
  buildWorkingMemoryIndex,
  captureMemory,
  handleWorkingMemoryAfterCommand,
  latestWeeklyReview,
  loadMemoryEvents,
  loadMemoryState,
  recordWorkingMemoryEvent,
  recentDailyLogs,
  saveMemoryState,
  syncMemoryMirror,
  workingMemoryLocalSources,
  workingMemoryStatus,
  writeDailyMemoryLog,
  writeMemoryRefreshPack
};
