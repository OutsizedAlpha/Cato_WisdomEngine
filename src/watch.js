const path = require("node:path");
const { parseFrontmatter, toWikiLink } = require("./markdown");
const { updateManagedNote } = require("./research");
const { tokenize } = require("./search");
const { ensureProjectStructure, listMarkdownNotes } = require("./project");
const {
  dateStamp,
  makeId,
  nowIso,
  readText,
  relativeToRoot,
  slugify,
  timestampStamp,
  truncate,
  uniquePath,
  writeText
} = require("./utils");

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

function uniqueList(values) {
  const seen = new Set();
  const output = [];
  for (const value of values.flatMap((entry) => normalizeList(entry))) {
    const key = slugify(value);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(value);
  }
  return output;
}

function inferEntities(context, topic) {
  const matches = String(context || "").matchAll(/\b(?:[A-Z][a-z]+|[A-Z]{2,})(?:\s+(?:[A-Z][a-z]+|[A-Z]{2,}))*\b/g);
  const topicKey = slugify(topic);
  return uniqueList(
    [...matches]
      .map((match) => match[0].trim())
      .filter((value) => value.length > 2 && slugify(value) !== topicKey)
  ).slice(0, 12);
}

function inferConcepts(topic, context) {
  const topicTokens = new Set(tokenize(topic));
  const counts = new Map();
  for (const token of tokenize(context)) {
    if (topicTokens.has(token)) {
      continue;
    }
    counts.set(token, (counts.get(token) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 10)
    .map(([token]) => token);
}

function loadWatchProfiles(root) {
  ensureProjectStructure(root);
  return listMarkdownNotes(root, "wiki/watch-profiles")
    .filter((filePath) => !/\/index\.md$/i.test(relativeToRoot(root, filePath)))
    .map((filePath) => {
      const rawContent = readText(filePath);
      const parsed = parseFrontmatter(rawContent);
      const titleMatch = parsed.body.match(/^#\s+(.+)$/m);

      return {
        path: filePath,
        relativePath: relativeToRoot(root, filePath),
        title: parsed.frontmatter.title || titleMatch?.[1]?.trim() || path.basename(filePath, ".md"),
        frontmatter: parsed.frontmatter
      };
    });
}

function phraseScore(subject, phrase) {
  const subjectKey = slugify(subject);
  const phraseKey = slugify(phrase);
  if (!subjectKey || !phraseKey) {
    return 0;
  }
  if (subjectKey === phraseKey) {
    return 1000 + phraseKey.length;
  }
  if (subjectKey.includes(phraseKey)) {
    return 600 + phraseKey.length;
  }
  if (phraseKey.includes(subjectKey)) {
    return 400 + subjectKey.length;
  }
  return 0;
}

function resolveWatchSubject(root, subject) {
  const profiles = loadWatchProfiles(root);
  const scored = profiles
    .map((profile) => {
      const phrases = [profile.title, ...normalizeList(profile.frontmatter.aliases)];
      const score = Math.max(...phrases.map((phrase) => phraseScore(subject, phrase)), 0);
      return { profile, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.profile.title.localeCompare(right.profile.title));

  if (!scored.length) {
    return {
      profile: null,
      query: subject
    };
  }

  const profile = scored[0].profile;
  const expandedTerms = uniqueList([
    subject,
    profile.title,
    profile.frontmatter.aliases,
    profile.frontmatter.entities,
    profile.frontmatter.concepts,
    profile.frontmatter.risk_triggers
  ]);

  return {
    profile,
    query: expandedTerms.join(" ")
  };
}

function resolveExactWatchProfile(root, subject) {
  const subjectKey = slugify(subject);
  return (
    loadWatchProfiles(root).find((profile) => {
      const phrases = [profile.title, ...normalizeList(profile.frontmatter.aliases)];
      return phrases.some((phrase) => slugify(phrase) === subjectKey);
    }) || null
  );
}

function renderList(values, emptyLine = "- None yet.") {
  const items = uniqueList(values);
  return items.length ? items.map((value) => `- ${value}`).join("\n") : emptyLine;
}

function buildWatchProfileArtifacts(root, profiles) {
  const indexLines = ["# Watch Profile Index", "", `Generated: ${dateStamp()}`, ""];
  const ontologyLines = [
    "# Watch Ontology",
    "",
    "This page is derived from active watch profiles. Edit the watch profiles rather than mutating this summary directly.",
    "",
    `Generated: ${dateStamp()}`,
    ""
  ];

  const sortedProfiles = profiles.sort((left, right) => left.title.localeCompare(right.title));
  if (!sortedProfiles.length) {
    indexLines.push("- No watch profiles yet.");
    ontologyLines.push("- No watch profiles yet.");
  } else {
    for (const profile of sortedProfiles) {
      indexLines.push(
        `- ${toWikiLink(profile.relativePath, profile.title)} (${profile.frontmatter.priority || "medium"}, ${profile.frontmatter.cadence || "ad-hoc"})`
      );

      ontologyLines.push(`## ${profile.title}`);
      ontologyLines.push("");
      ontologyLines.push(`- Profile: ${toWikiLink(profile.relativePath, profile.title)}`);
      ontologyLines.push(`- Priority: ${profile.frontmatter.priority || "medium"}`);
      ontologyLines.push(`- Cadence: ${profile.frontmatter.cadence || "ad-hoc"}`);
      ontologyLines.push(`- Why it matters: ${profile.frontmatter.watch_context || "No watch context recorded yet."}`);
      ontologyLines.push("");
      ontologyLines.push("### Aliases");
      ontologyLines.push(renderList(profile.frontmatter.aliases));
      ontologyLines.push("");
      ontologyLines.push("### Entities");
      ontologyLines.push(renderList(profile.frontmatter.entities));
      ontologyLines.push("");
      ontologyLines.push("### Concepts");
      ontologyLines.push(renderList(profile.frontmatter.concepts));
      ontologyLines.push("");
      ontologyLines.push("### Risk Triggers");
      ontologyLines.push(renderList(profile.frontmatter.risk_triggers));
      ontologyLines.push("");
    }
  }

  indexLines.push("");
  ontologyLines.push("");

  writeText(path.join(root, "wiki", "_indices", "watch-profiles.md"), `${indexLines.join("\n").trim()}\n`);
  writeText(path.join(root, "wiki", "watch-profiles", "index.md"), `${indexLines.join("\n").trim()}\n`);
  writeText(path.join(root, "wiki", "glossary", "watch-ontology.md"), `${ontologyLines.join("\n").trim()}\n`);
}

function createWatchProfile(root, subject, options = {}) {
  ensureProjectStructure(root);
  const existing = resolveExactWatchProfile(root, subject);
  const notePath = existing
    ? path.join(root, existing.relativePath)
    : uniquePath(path.join(root, "wiki", "watch-profiles", `${slugify(subject).slice(0, 80) || "watch"}.md`));

  const existingFrontmatter = existing?.frontmatter || {};
  const watchContext = options.context || existingFrontmatter.watch_context || "";
  const aliases = uniqueList([existingFrontmatter.aliases, options.aliases]);
  const entities = uniqueList([existingFrontmatter.entities, options.entities, inferEntities(watchContext, subject)]);
  const concepts = uniqueList([existingFrontmatter.concepts, options.concepts, inferConcepts(subject, watchContext)]);
  const riskTriggers = uniqueList([existingFrontmatter.risk_triggers, options.triggers]);
  const frontmatter = {
    id: existingFrontmatter.id || makeId("WATCH", slugify(subject).padEnd(12, "w")),
    kind: "watch-profile",
    title: subject,
    status: options.status || existingFrontmatter.status || "active",
    priority: options.priority || existingFrontmatter.priority || "medium",
    cadence: options.cadence || existingFrontmatter.cadence || "ad-hoc",
    created_at: existingFrontmatter.created_at || nowIso(),
    updated_at: nowIso(),
    watch_context: watchContext,
    reporting_instructions: options.instructions || existingFrontmatter.reporting_instructions || "",
    aliases,
    entities,
    concepts,
    risk_triggers: riskTriggers,
    related: uniqueList([existingFrontmatter.related, options.related])
  };

  updateManagedNote(notePath, frontmatter, subject, {
    brief: `
## Managed Watch Brief

- Priority: ${frontmatter.priority}
- Cadence: ${frontmatter.cadence}
- Status: ${frontmatter.status}
- Why this watch exists: ${watchContext || "Add watch context so the profile reflects why this topic matters."}
`,
    scope: `
## Managed Scope

### Aliases

${renderList(aliases)}

### Entities

${renderList(entities)}

### Concepts

${renderList(concepts)}
`,
    triggers: `
## Managed Risk Triggers

${renderList(riskTriggers, "- No explicit risk triggers recorded yet.")}
`,
    instructions: `
## Managed Reporting Instructions

${frontmatter.reporting_instructions || "- Use grounded surveillance framing and emphasise actionable changes, catalysts, and de-risking implications."}
`
  });

  const profiles = loadWatchProfiles(root);
  buildWatchProfileArtifacts(root, profiles);

  return {
    profilePath: relativeToRoot(root, notePath),
    ontologyPath: "wiki/glossary/watch-ontology.md"
  };
}

function listActiveWatchProfiles(root) {
  return loadWatchProfiles(root).filter((profile) => (profile.frontmatter.status || "active") !== "inactive");
}

function formatWatchProfileLine(profile) {
  const context = truncate(profile.frontmatter.watch_context || "", 110);
  return `${profile.title} [${profile.frontmatter.priority || "medium"} | ${profile.frontmatter.cadence || "ad-hoc"}]${
    context ? ` - ${context}` : ""
  }`;
}

function writeWatchRefreshReport(root, refreshed) {
  const lines = ["# Watch Refresh Report", "", `Generated: ${nowIso()}`, ""];
  if (!refreshed.length) {
    lines.push("- No watch profiles were refreshed.");
  } else {
    for (const entry of refreshed) {
      lines.push(`## ${entry.subject}`);
      lines.push(`- Profile: \`${entry.profilePath}\``);
      lines.push(`- Surveillance page: \`${entry.notePath}\``);
      lines.push(`- Matched evidence: ${entry.resultsCount}`);
      lines.push("");
    }
  }
  const reportPath = path.join(root, "logs", "report_runs", `watch-refresh-${timestampStamp()}.md`);
  writeText(reportPath, `${lines.join("\n").trim()}\n`);
  return relativeToRoot(root, reportPath);
}

module.exports = {
  buildWatchProfileArtifacts,
  createWatchProfile,
  formatWatchProfileLine,
  listActiveWatchProfiles,
  loadWatchProfiles,
  resolveWatchSubject,
  writeWatchRefreshReport
};
