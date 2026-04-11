const fs = require("node:fs");
const path = require("node:path");
const { REQUIRED_FRONTMATTER } = require("./constants");
const { extractWikiLinks, normalizeWikiTarget, parseFrontmatter, sectionContent } = require("./markdown");
const { ensureProjectStructure, listMarkdownNotes } = require("./project");
const {
  scanDirectoryForSensitiveData,
  scanFileForSensitiveData,
  scanTextForSensitiveData,
  summarizeSensitiveHits
} = require("./sensitive-data");
const { buildCatalogGraph, buildTagSummary, loadCatalogNotes } = require("./wiki-catalog");
const { nowIso, readText, relativeToRoot, timestampStamp, writeText } = require("./utils");

function isRetiredStatus(frontmatter) {
  return ["inactive", "obsolete", "retired", "superseded"].includes(String(frontmatter.status || "").toLowerCase());
}

function normalizeReviewStatus(frontmatter = {}) {
  return String(frontmatter.review_status || "").trim().toLowerCase();
}

function hasVisualReview(frontmatter = {}) {
  const reviewStatus = normalizeReviewStatus(frontmatter);
  const reviewMethod = String(frontmatter.review_method || "").trim().toLowerCase();
  if (["visual_reviewed", "visual-and-text-reviewed", "operator_reviewed"].includes(reviewStatus)) {
    return true;
  }
  return /visual|page image|chart review|rendered pages/.test(reviewMethod);
}

function noteKindRelative(relativePath) {
  if (
    relativePath.endsWith("/index.md") ||
    relativePath.endsWith("/README.md") ||
    relativePath === "wiki/claims/contested.md"
  ) {
    return null;
  }
  if (relativePath.startsWith("wiki/source-notes/")) {
    return "source-note";
  }
  if (relativePath.startsWith("wiki/drafts/")) {
    return "draft-note";
  }
  if (relativePath.startsWith("wiki/claims/")) {
    return "claim-page";
  }
  if (relativePath.startsWith("wiki/concepts/")) {
    return "concept-page";
  }
  if (relativePath.startsWith("wiki/entities/")) {
    return "entity-page";
  }
  if (relativePath.startsWith("wiki/states/")) {
    return "state-page";
  }
  if (relativePath.startsWith("wiki/regimes/")) {
    return "regime-page";
  }
  if (relativePath.startsWith("wiki/decisions/")) {
    return "decision-note";
  }
  if (relativePath.startsWith("wiki/probabilities/")) {
    return "probability-page";
  }
  if (relativePath === "wiki/memory/current-context.md") {
    return "memory-context-page";
  }
  if (relativePath.startsWith("wiki/memory/daily/")) {
    return "daily-memory-log";
  }
  if (relativePath.startsWith("wiki/memory/weekly/")) {
    return "weekly-review-page";
  }
  if (relativePath.startsWith("wiki/theses/")) {
    return "thesis-page";
  }
  if (relativePath.startsWith("wiki/synthesis/")) {
    return "synthesis-note";
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
  if (relativePath.startsWith("wiki/self/constitution/")) {
    return "constitution-note";
  }
  if (relativePath.startsWith("wiki/self/modes/")) {
    return "mode-note";
  }
  if (relativePath.startsWith("wiki/self/preferences/")) {
    return "preference-note";
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

function isArchiveNote(relativePath) {
  return (
    /^outputs\/[^/]+\/archive\//.test(relativePath) ||
    relativePath.startsWith("wiki/reports/archive/")
  );
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
  const noteFiles = listMarkdownNotes(root, "wiki")
    .concat(listMarkdownNotes(root, "outputs"))
    .filter((filePath) => !isArchiveNote(relativeToRoot(root, filePath)));
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

    const noteSensitiveScan = scanTextForSensitiveData(content, {
      sourceLabel: relative,
      maxHits: 8
    });
    if (noteSensitiveScan.flagged) {
      issues.push({
        severity: "warning",
        file: relative,
        message: `Sensitive-data pattern detected in note content (${summarizeSensitiveHits(noteSensitiveScan.hits)}).`
      });
    }

    if (kind === "source-note") {
      const status = String(frontmatter.status || "").trim().toLowerCase();
      const reviewStatus = normalizeReviewStatus(frontmatter);
      const captureSource = String(frontmatter.capture_source || "").trim().toLowerCase();
      const documentClass = String(frontmatter.document_class || "").trim().toLowerCase();

      for (const field of ["raw_path", "extracted_text_path", "metadata_path", "table_preview_path", "figure_note_path"]) {
        const targetPath = frontmatter[field];
        if (targetPath && !fs.existsSync(path.join(root, targetPath))) {
          issues.push({ severity: "error", file: relative, message: `Referenced file does not exist: \`${targetPath}\`.` });
        }
      }
      if (frontmatter.sensitive_data_flagged) {
        issues.push({
          severity: "warning",
          file: relative,
          message: `Source note is marked \`sensitive_data_flagged\`${frontmatter.sensitive_data_summary ? ` (${frontmatter.sensitive_data_summary})` : ""}.`
        });
      }
      for (const field of ["raw_path", "extracted_text_path", "metadata_path"]) {
        const targetPath = String(frontmatter[field] || "").trim();
        if (!targetPath) {
          continue;
        }
        const absolutePath = path.join(root, targetPath);
        if (!fs.existsSync(absolutePath)) {
          continue;
        }
        const scan = fs.statSync(absolutePath).isDirectory()
          ? scanDirectoryForSensitiveData(absolutePath, {
              sourceLabel: targetPath,
              maxHits: 8,
              sourceType: frontmatter.source_type
            })
          : scanFileForSensitiveData(absolutePath, {
              sourceLabel: targetPath,
              maxHits: 8,
              sourceType: frontmatter.source_type
            });
        if (scan.flagged) {
          issues.push({
            severity: "warning",
            file: relative,
            message: `Sensitive-data pattern detected in \`${field}\` target (${summarizeSensitiveHits(scan.hits)}).`
          });
        }
      }
      if (!frontmatter.concepts?.length && !frontmatter.entities?.length) {
        issues.push({
          severity: "info",
          file: relative,
          message: "Source note has no concepts or entities yet."
        });
      }
      if (!frontmatter.document_class) {
        issues.push({ severity: "warning", file: relative, message: "Source note is missing `document_class` routing." });
      }
      if (!frontmatter.draft_workspace_path) {
        issues.push({ severity: "info", file: relative, message: "Source note does not link to an append-and-review draft note." });
      }
      if (captureSource === "codex_pdf_vision_handoff" && (!reviewStatus || reviewStatus === "unreviewed" || status === "draft")) {
        issues.push({
          severity: "info",
          file: relative,
          message: "Codex PDF handoff note is still provisional; set `review_status` after text or visual review."
        });
      }
      if (documentClass === "chartpack_or_visual" && !hasVisualReview(frontmatter)) {
        issues.push({
          severity: "warning",
          file: relative,
          message: "Chartpack or visual source note is missing a visual review trail."
        });
      }
      if (reviewStatus && reviewStatus !== "unreviewed" && status === "draft") {
        issues.push({
          severity: "warning",
          file: relative,
          message: "Reviewed source note is still marked `draft`."
        });
      }
    }

    if (kind === "thesis-page" && !sectionContent(body, "Tripwires / Falsifiers")) {
      issues.push({ severity: "warning", file: relative, message: "Thesis page is missing falsifiers content." });
    }

    if ((kind === "principle-note" || kind === "portfolio-philosophy-note") && !sectionContent(body, "What Would Falsify It")) {
      issues.push({ severity: "warning", file: relative, message: "Principle note is missing falsifier content." });
    }

    if (kind === "state-page" && !sectionContent(body, "Managed Snapshot")) {
      issues.push({ severity: "warning", file: relative, message: "State page is missing a managed snapshot block." });
    }
    if (kind === "state-page" && !sectionContent(body, "Managed Counter-Arguments")) {
      issues.push({ severity: "warning", file: relative, message: "State page is missing a managed counter-arguments block." });
    }
    if (kind === "state-page" && !sectionContent(body, "Managed Data Gaps")) {
      issues.push({ severity: "warning", file: relative, message: "State page is missing a managed data-gaps block." });
    }

    if (kind === "decision-note" && !sectionContent(body, "Managed Strongest Counter-Case")) {
      issues.push({ severity: "warning", file: relative, message: "Decision note is missing a counter-case block." });
    }
    if (kind === "decision-note" && !sectionContent(body, "Managed Data Gaps")) {
      issues.push({ severity: "warning", file: relative, message: "Decision note is missing a data-gaps block." });
    }
    if (kind === "claim-page" && !sectionContent(body, "Data Gaps / What Would Strengthen It")) {
      issues.push({ severity: "warning", file: relative, message: "Claim page is missing a data-gaps block." });
    }
    if (kind === "claim-page" && !sectionContent(body, "Counter-Arguments / Weakening Evidence")) {
      issues.push({ severity: "warning", file: relative, message: "Claim page is missing a counter-arguments block." });
    }
    if (kind === "claim-page" && Number(frontmatter.confidence_score || 0) < 0.3) {
      issues.push({
        severity: "warning",
        file: relative,
        message: `Claim page is low confidence (${frontmatter.confidence_score || 0}).`
      });
    }

    for (const link of extractWikiLinks(content)) {
      inboundCounts.set(link, (inboundCounts.get(link) || 0) + 1);
      if (!targets.has(normalizeWikiTarget(link))) {
        issues.push({ severity: "warning", file: relative, message: `Broken wiki link: \`${link}\`.` });
      }
    }
  }

  const catalogNotes = loadCatalogNotes(root);
  const graph = buildCatalogGraph(catalogNotes);
  const tagSummary = buildTagSummary(catalogNotes);
  const orphanKinds = new Set([
    "concept-page",
    "entity-page",
    "claim-page",
    "state-page",
    "decision-note",
    "thesis-page",
    "synthesis-note",
    "source-note"
  ]);

  for (const note of catalogNotes) {
    if (/\/(?:index|README)\.md$/i.test(note.relativePath)) {
      continue;
    }
    if (isRetiredStatus(note.frontmatter)) {
      continue;
    }
    if (orphanKinds.has(note.kind) && !(graph.backlinks.get(note.relativePath) || []).length) {
      issues.push({
        severity: "info",
        file: note.relativePath,
        message: "No inbound wiki links detected."
      });
    }
    if (note.freshness?.stale) {
      issues.push({
        severity: note.kind === "draft-note" ? "info" : "warning",
        file: note.relativePath,
        message: `Stale ${note.kind || "note"}: ${note.freshness.ageDays} days old against ${note.freshness.thresholdDays}-day threshold.`
      });
    }
    if (note.freshness?.stale && note.openThreads.length) {
      issues.push({
        severity: "warning",
        file: note.relativePath,
        message: `Stale note still has ${note.openThreads.length} explicit open thread(s).`
      });
    }
  }

  for (const tag of tagSummary.filter((entry) => entry.labels.length > 1)) {
    issues.push({
      severity: "warning",
      file: "wiki/_indices/tags.md",
      message: `Tag drift detected for \`${tag.key}\`: ${tag.labels.join(", ")}`
    });
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
