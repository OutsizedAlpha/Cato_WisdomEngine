const fs = require("node:fs");
const path = require("node:path");
const { REQUIRED_FRONTMATTER } = require("./constants");
const { extractWikiLinks, normalizeWikiTarget, parseFrontmatter, sectionContent } = require("./markdown");
const { ensureProjectStructure, listMarkdownNotes } = require("./project");
const { nowIso, readText, relativeToRoot, timestampStamp, writeText } = require("./utils");

function isRetiredStatus(frontmatter) {
  return ["inactive", "obsolete", "retired"].includes(String(frontmatter.status || "").toLowerCase());
}

function noteKindRelative(relativePath) {
  if (relativePath.endsWith("/index.md") || relativePath.endsWith("/README.md")) {
    return null;
  }
  if (relativePath.startsWith("wiki/source-notes/")) {
    return "source-note";
  }
  if (relativePath.startsWith("wiki/concepts/")) {
    return "concept-page";
  }
  if (relativePath.startsWith("wiki/entities/")) {
    return "entity-page";
  }
  if (relativePath.startsWith("wiki/theses/")) {
    return "thesis-page";
  }
  if (relativePath.startsWith("wiki/watch-profiles/")) {
    return "watch-profile";
  }
  if (relativePath.startsWith("wiki/surveillance/")) {
    return "surveillance-page";
  }
  if (relativePath.startsWith("wiki/questions/")) {
    return "question-page";
  }
  if (relativePath.startsWith("wiki/self/principles/")) {
    return "principle-note";
  }
  if (relativePath.startsWith("wiki/self/heuristics/")) {
    return "heuristic-note";
  }
  if (relativePath.startsWith("wiki/self/anti-patterns/")) {
    return "anti-pattern-note";
  }
  if (relativePath.startsWith("wiki/self/decision-rules/")) {
    return "decision-rule-note";
  }
  if (relativePath.startsWith("wiki/self/portfolio-philosophy/")) {
    return "portfolio-philosophy-note";
  }
  if (relativePath.startsWith("wiki/self/postmortems/")) {
    return "postmortem-note";
  }
  if (relativePath.startsWith("wiki/self/bias-watch/")) {
    return "bias-watch-note";
  }
  if (relativePath.startsWith("wiki/self/communication-style/")) {
    return "communication-style-note";
  }
  return null;
}

function buildTargetSet(root) {
  const targets = new Set();
  for (const filePath of listMarkdownNotes(root, "wiki").concat(listMarkdownNotes(root, "outputs"))) {
    const relative = relativeToRoot(root, filePath).replace(/\.md$/i, "");
    const withoutWiki = relative.replace(/^wiki\//, "");
    const stem = path.basename(relative);
    targets.add(relative);
    targets.add(withoutWiki);
    targets.add(stem);
  }
  return targets;
}

function lintProject(root) {
  ensureProjectStructure(root);
  const noteFiles = listMarkdownNotes(root, "wiki").concat(listMarkdownNotes(root, "outputs"));
  const targets = buildTargetSet(root);
  const inboundCounts = new Map();
  const issues = [];

  for (const filePath of noteFiles) {
    const relative = relativeToRoot(root, filePath);
    const content = readText(filePath);
    const { frontmatter, body } = parseFrontmatter(content);
    if (isRetiredStatus(frontmatter)) {
      continue;
    }
    const kind = noteKindRelative(relative);

    if (kind && Object.keys(frontmatter).length === 0) {
      issues.push({ severity: "error", file: relative, message: "Missing frontmatter." });
    }

    if (kind && REQUIRED_FRONTMATTER[kind]) {
      for (const field of REQUIRED_FRONTMATTER[kind]) {
        const value = frontmatter[field];
        if (value === undefined || value === null || value === "") {
          issues.push({ severity: "warning", file: relative, message: `Missing required field \`${field}\`.` });
        }
      }
    }

    if (kind === "source-note") {
      for (const field of ["raw_path", "metadata_path"]) {
        const targetPath = frontmatter[field];
        if (targetPath && !fs.existsSync(path.join(root, targetPath))) {
          issues.push({ severity: "error", file: relative, message: `Referenced file does not exist: \`${targetPath}\`.` });
        }
      }
      if (!frontmatter.concepts?.length && !frontmatter.entities?.length) {
        issues.push({
          severity: "info",
          file: relative,
          message: "Source note has no concepts or entities yet."
        });
      }
    }

    if (kind === "thesis-page" && !sectionContent(body, "Tripwires / Falsifiers")) {
      issues.push({ severity: "warning", file: relative, message: "Thesis page is missing falsifiers content." });
    }

    if ((kind === "principle-note" || kind === "portfolio-philosophy-note") && !sectionContent(body, "What Would Falsify It")) {
      issues.push({ severity: "warning", file: relative, message: "Principle note is missing falsifier content." });
    }

    for (const link of extractWikiLinks(content)) {
      inboundCounts.set(link, (inboundCounts.get(link) || 0) + 1);
      if (!targets.has(normalizeWikiTarget(link))) {
        issues.push({ severity: "warning", file: relative, message: `Broken wiki link: \`${link}\`.` });
      }
    }
  }

  for (const filePath of listMarkdownNotes(root, "wiki/concepts").concat(listMarkdownNotes(root, "wiki/entities"))) {
    const rawRelative = relativeToRoot(root, filePath);
    if (/\/(?:index|README)\.md$/i.test(rawRelative)) {
      continue;
    }
    const { frontmatter } = parseFrontmatter(readText(filePath));
    if (isRetiredStatus(frontmatter)) {
      continue;
    }
    const relative = rawRelative.replace(/\.md$/i, "");
    const withoutWiki = relative.replace(/^wiki\//, "");
    const stem = path.basename(relative);
    const inbound = (inboundCounts.get(relative) || 0) + (inboundCounts.get(withoutWiki) || 0) + (inboundCounts.get(stem) || 0);
    if (inbound === 0) {
      issues.push({
        severity: "info",
        file: `${relative}.md`,
        message: "No inbound wiki links detected."
      });
    }
  }

  const grouped = {
    error: issues.filter((issue) => issue.severity === "error"),
    warning: issues.filter((issue) => issue.severity === "warning"),
    info: issues.filter((issue) => issue.severity === "info")
  };

  const reportLines = [
    "# Lint Report",
    "",
    `Generated: ${nowIso()}`,
    "",
    `- Errors: ${grouped.error.length}`,
    `- Warnings: ${grouped.warning.length}`,
    `- Info: ${grouped.info.length}`,
    ""
  ];

  for (const severity of ["error", "warning", "info"]) {
    reportLines.push(`## ${severity[0].toUpperCase()}${severity.slice(1)}s`);
    if (!grouped[severity].length) {
      reportLines.push("- None.");
    } else {
      for (const issue of grouped[severity]) {
        reportLines.push(`- \`${issue.file}\`: ${issue.message}`);
      }
    }
    reportLines.push("");
  }

  const reportPath = path.join(root, "logs", "lint", `lint-${timestampStamp()}.md`);
  writeText(reportPath, `${reportLines.join("\n").trim()}\n`);

  return {
    reportPath: relativeToRoot(root, reportPath),
    issues
  };
}

module.exports = {
  lintProject
};
