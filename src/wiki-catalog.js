const path = require("node:path");
const {
  extractWikiLinks,
  normalizeWikiTarget,
  parseFrontmatter,
  sectionContent,
  stripMarkdownFormatting
} = require("./markdown");
const { listMarkdownNotes } = require("./project");
const { readText, relativeToRoot, slugify, truncate } = require("./utils");

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

function catalogNoteKind(relativePath, frontmatter = {}) {
  if (relativePath.startsWith("wiki/drafts/")) {
    return "draft-note";
  }
  return frontmatter.kind || "";
}

function freshnessConfig(kind) {
  const thresholds = {
    "state-page": 14,
    "decision-note": 30,
    "surveillance-page": 14,
    "watch-profile": 30,
    "question-page": 30,
    "claim-page": 180,
    "draft-note": 21
  };
  return thresholds[kind] || 0;
}

function ageDays(value) {
  const parsed = Date.parse(String(value || ""));
  if (Number.isNaN(parsed)) {
    return null;
  }
  return Math.floor((Date.now() - parsed) / (1000 * 60 * 60 * 24));
}

function freshnessStatus(note) {
  const thresholdDays = freshnessConfig(note.kind);
  if (!thresholdDays) {
    return null;
  }
  const basis =
    note.frontmatter.last_refreshed_at ||
    note.frontmatter.last_updated_at ||
    note.frontmatter.updated_at ||
    note.frontmatter.created_at ||
    note.frontmatter.ingested_at ||
    note.frontmatter.claim_date ||
    note.frontmatter.date ||
    "";
  const days = ageDays(basis);
  if (days === null) {
    return {
      stale: false,
      thresholdDays,
      basis: "",
      ageDays: null
    };
  }
  return {
    stale: days > thresholdDays,
    thresholdDays,
    basis,
    ageDays: days
  };
}

function openThreadLines(note) {
  const headings = [
    "Open Questions",
    "Data Gaps",
    "Managed Data Gaps",
    "Managed What Would Flip It",
    "What Would Change The View",
    "Missing Evidence",
    "Open Issues"
  ];

  const lines = [];
  for (const heading of headings) {
    const section = sectionContent(note.body, heading);
    if (!section) {
      continue;
    }
    for (const rawLine of section.split(/\r?\n/)) {
      const cleaned = rawLine.replace(/^\s*[-*]\s+/, "").trim();
      if (!cleaned) {
        continue;
      }
      if (
        /^none\b/i.test(cleaned) ||
        /^no\b/i.test(cleaned) ||
        /^not yet\b/i.test(cleaned) ||
        /^add\b/i.test(cleaned) ||
        /^review\b/i.test(cleaned)
      ) {
        continue;
      }
      lines.push({
        heading,
        text: truncate(cleaned.replace(/\s+/g, " "), 200)
      });
    }
  }
  return lines;
}

function loadCatalogNotes(root, options = {}) {
  const dirs = Array.isArray(options.relativeDirs) && options.relativeDirs.length ? options.relativeDirs : ["wiki", "outputs"];
  const notes = [];

  for (const relativeDir of dirs) {
    for (const filePath of listMarkdownNotes(root, relativeDir)) {
      const relativePath = relativeToRoot(root, filePath);
      if (relativePath.startsWith("wiki/_templates/")) {
        continue;
      }
      const rawContent = readText(filePath);
      const parsed = parseFrontmatter(rawContent);
      const title = parsed.frontmatter.title || path.basename(filePath, ".md");
      const kind = catalogNoteKind(relativePath, parsed.frontmatter);
      const tags = normalizeList(parsed.frontmatter.tags);
      const links = extractWikiLinks(rawContent);
      const note = {
        path: filePath,
        relativePath,
        title,
        frontmatter: parsed.frontmatter,
        body: parsed.body,
        kind,
        status: String(parsed.frontmatter.status || "").toLowerCase(),
        tags,
        links,
        openThreads: [],
        freshness: null
      };
      note.openThreads = openThreadLines(note);
      note.freshness = freshnessStatus(note);
      notes.push(note);
    }
  }

  return notes;
}

function buildTargetAliases(note) {
  const relative = note.relativePath.replace(/\.md$/i, "");
  const withoutWiki = relative.replace(/^wiki\//, "");
  const stem = path.basename(relative);
  return [relative, withoutWiki, stem].filter(Boolean);
}

function buildCatalogGraph(notes) {
  const aliasMap = new Map();
  const backlinks = new Map();

  for (const note of notes) {
    for (const alias of buildTargetAliases(note)) {
      aliasMap.set(alias, note.relativePath);
    }
    backlinks.set(note.relativePath, []);
  }

  for (const note of notes) {
    for (const link of note.links) {
      const target = aliasMap.get(normalizeWikiTarget(link));
      if (!target || target === note.relativePath) {
        continue;
      }
      backlinks.get(target).push(note.relativePath);
    }
  }

  return {
    aliasMap,
    backlinks: new Map(
      [...backlinks.entries()].map(([relativePath, sources]) => [relativePath, [...new Set(sources)].sort()])
    )
  };
}

function buildTagSummary(notes) {
  const tags = new Map();
  for (const note of notes) {
    for (const tag of note.tags) {
      const key = slugify(tag);
      if (!key) {
        continue;
      }
      if (!tags.has(key)) {
        tags.set(key, {
          key,
          labels: new Set(),
          count: 0,
          notes: []
        });
      }
      const entry = tags.get(key);
      entry.labels.add(tag);
      entry.count += 1;
      entry.notes.push(note.relativePath);
    }
  }

  return [...tags.values()]
    .map((entry) => ({
      key: entry.key,
      labels: [...entry.labels].sort(),
      count: entry.count,
      notes: [...new Set(entry.notes)].sort()
    }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));
}

function buildStructuredCatalog(root, options = {}) {
  const notes = loadCatalogNotes(root, options);
  const graph = buildCatalogGraph(notes);
  const tags = buildTagSummary(notes);

  return {
    notes: notes.map((note) => ({
      relativePath: note.relativePath,
      title: note.title,
      kind: note.kind,
      status: note.status,
      tags: note.tags,
      backlinks: graph.backlinks.get(note.relativePath) || [],
      open_threads: note.openThreads,
      freshness: note.freshness,
      document_class: note.frontmatter.document_class || "",
      related: normalizeList(note.frontmatter.related)
    })),
    tags
  };
}

function summaryText(note) {
  return truncate(stripMarkdownFormatting(note.body).replace(/\s+/g, " ").trim(), 200);
}

module.exports = {
  buildCatalogGraph,
  buildStructuredCatalog,
  buildTagSummary,
  catalogNoteKind,
  loadCatalogNotes,
  normalizeList,
  summaryText
};
