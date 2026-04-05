const fs = require("node:fs");
const path = require("node:path");
const { refreshClaims } = require("./claims");
const {
  buildConceptOntologyIndex,
  isMeaningfulCandidateConcept,
  isMeaningfulExplicitConcept,
  normalizeConceptLabel
} = require("./concept-quality");
const {
  parseFrontmatter,
  renderMarkdown,
  sectionContent,
  stripMarkdownFormatting,
  toWikiLink,
  upsertManagedBlock
} = require("./markdown");
const { ensureProjectStructure, listMarkdownNotes } = require("./project");
const { buildAppendReviewBody, detectDocumentClass, reviewLensForDocumentClass } = require("./source-routing");
const { buildCatalogGraph, buildTagSummary, loadCatalogNotes, summaryText } = require("./wiki-catalog");
const { buildWatchProfileArtifacts, loadWatchProfiles } = require("./watch");
const { dateStamp, nowIso, readJson, readText, relativeToRoot, slugify, truncate, writeJson, writeText } = require("./utils");

const POSITIVE_CUES = ["outperform", "improve", "tailwind", "strong", "benefit", "support", "higher", "bull"];
const NEGATIVE_CUES = ["underperform", "weaken", "headwind", "risk", "pressure", "lower", "fragile", "bear"];

function loadNotes(root, relativeDir) {
  return listMarkdownNotes(root, relativeDir).map((filePath) => {
    const raw = readText(filePath);
    const parsed = parseFrontmatter(raw);
    return {
      path: filePath,
      relativePath: relativeToRoot(root, filePath),
      frontmatter: parsed.frontmatter,
      body: parsed.body,
      title: parsed.frontmatter.title || path.basename(filePath, ".md")
    };
  });
}

function backfillSourceRouting(root, sourceNotes) {
  let updated = 0;

  for (const note of sourceNotes) {
    const extractedTextPath = note.frontmatter.extracted_text_path
      ? path.join(root, note.frontmatter.extracted_text_path)
      : "";
    const extractedText = extractedTextPath && fs.existsSync(extractedTextPath) ? readText(extractedTextPath) : "";
    const documentClass = note.frontmatter.document_class || detectDocumentClass(
      note.frontmatter.source_type || "note",
      note.title,
      extractedText,
      note.frontmatter
    );
    const draftRelativePath =
      note.frontmatter.draft_workspace_path ||
      relativeToRoot(
        root,
        path.join(root, "wiki", "drafts", "append-review", `${slugify(note.title).slice(0, 80) || note.frontmatter.id}.md`)
      );
    const draftAbsolutePath = path.join(root, draftRelativePath);

    if (!fs.existsSync(draftAbsolutePath)) {
      writeText(
        draftAbsolutePath,
        renderMarkdown(
          {
            id: `DRAFT-${new Date().getUTCFullYear()}-${slugify(note.title).slice(0, 12).toUpperCase() || "SOURCE"}`,
            kind: "draft-note",
            title: `Append And Review: ${note.title}`,
            status: "open",
            stage: "append-review",
            source_note_path: note.relativePath,
            raw_path: note.frontmatter.raw_path || "",
            metadata_path: note.frontmatter.metadata_path || "",
            document_class: documentClass,
            created_at: note.frontmatter.ingested_at || nowIso()
          },
          buildAppendReviewBody(
            {
              id: note.frontmatter.id || "",
              title: note.title,
              source_type: note.frontmatter.source_type || "note",
              document_class: documentClass,
              review_lens: reviewLensForDocumentClass(documentClass),
              note_path: note.relativePath,
              raw_path: note.frontmatter.raw_path || "",
              metadata_path: note.frontmatter.metadata_path || "",
              extraction_status: note.frontmatter.extraction_status || "",
              extraction_method: note.frontmatter.extraction_method || "",
              summary: sectionContent(note.body, "Summary") || summaryText(note),
              candidate_concepts: normalizeList(note.frontmatter.candidate_concepts),
              tags: normalizeList(note.frontmatter.tags)
            },
            { extractedText }
          )
        )
      );
    }

    if (note.frontmatter.document_class !== documentClass || note.frontmatter.draft_workspace_path !== draftRelativePath) {
      writeText(
        note.path,
        renderMarkdown(
          {
            ...note.frontmatter,
            document_class: documentClass,
            draft_workspace_path: draftRelativePath
          },
          note.body
        )
      );
      updated += 1;
    }
  }

  return updated;
}

function normalizeList(value) {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [];
}

function noteSummary(note, length = 220) {
  const summary = sectionContent(note.body, "Summary");
  const whatItSays = sectionContent(note.body, "What This Source Says");
  const bodyText = stripMarkdownFormatting(`${summary}\n${whatItSays}\n${note.body}`).replace(/\s+/g, " ").trim();
  return truncate(bodyText, length);
}

function buildSourceIndex(root, sourceNotes) {
  const byType = new Map();
  for (const note of sourceNotes) {
    const type = note.frontmatter.source_type || "unknown";
    if (!byType.has(type)) {
      byType.set(type, []);
    }
    byType.get(type).push(note);
  }

  const sections = ["# Source Index", "", `Generated: ${dateStamp()}`, ""];
  for (const type of [...byType.keys()].sort()) {
    sections.push(`## ${type}`);
    for (const note of byType.get(type).sort((a, b) => a.title.localeCompare(b.title))) {
      const date = note.frontmatter.date ? ` (${note.frontmatter.date})` : "";
      sections.push(`- ${toWikiLink(note.relativePath, note.title)}${date}`);
    }
    sections.push("");
  }

  writeText(path.join(root, "wiki", "_indices", "sources.md"), `${sections.join("\n").trim()}\n`);
}

function buildConceptRecords(sourceNotes, options = {}) {
  const conceptMap = new Map();
  const candidateCounts = new Map();
  const candidateLabels = new Map();
  const ontologyIndex = options.ontologyIndex || buildConceptOntologyIndex();

  for (const note of sourceNotes) {
    for (const concept of normalizeList(note.frontmatter.candidate_concepts)) {
      if (!isMeaningfulCandidateConcept(concept, ontologyIndex)) {
        continue;
      }
      const key = normalizeConceptLabel(concept);
      if (!key) {
        continue;
      }
      candidateCounts.set(key, (candidateCounts.get(key) || 0) + 1);
      if (!candidateLabels.has(key)) {
        candidateLabels.set(key, key);
      }
    }
  }

  for (const note of sourceNotes) {
    const explicitConcepts = normalizeList(note.frontmatter.concepts).filter((concept) =>
      isMeaningfulExplicitConcept(concept, ontologyIndex)
    );
    const promotedCandidates = options.promoteCandidates
      ? normalizeList(note.frontmatter.candidate_concepts)
          .filter((concept) => isMeaningfulCandidateConcept(concept, ontologyIndex))
          .map((concept) => normalizeConceptLabel(concept))
          .filter((concept) => concept && (candidateCounts.get(concept) || 0) >= 2)
          .map((concept) => candidateLabels.get(concept) || concept)
      : [];

    const concepts = [];
    const seenConcepts = new Set();
    for (const concept of [...explicitConcepts, ...promotedCandidates]) {
      const key = normalizeConceptLabel(concept);
      if (!key || seenConcepts.has(key)) {
        continue;
      }
      seenConcepts.add(key);
      concepts.push(concept);
    }

    for (const concept of concepts) {
      if (!conceptMap.has(concept)) {
        conceptMap.set(concept, []);
      }
      conceptMap.get(concept).push(note);
    }
  }

  return conceptMap;
}

function buildEntityRecords(sourceNotes) {
  const entityMap = new Map();
  for (const note of sourceNotes) {
    for (const entity of normalizeList(note.frontmatter.entities)) {
      if (!entityMap.has(entity)) {
        entityMap.set(entity, []);
      }
      entityMap.get(entity).push(note);
    }
  }
  return entityMap;
}

function ensureManagedNote(filePath, frontmatter, title, baseBody, managedBlocks) {
  let content = renderMarkdown(frontmatter, baseBody);
  if (fs.existsSync(filePath)) {
    const parsed = parseFrontmatter(readText(filePath));
    const mergedFrontmatter = {
      ...frontmatter,
      ...parsed.frontmatter
    };
    for (const key of Object.keys(frontmatter)) {
      mergedFrontmatter[key] = frontmatter[key];
    }
    content = renderMarkdown(mergedFrontmatter, parsed.body || baseBody);
  }
  for (const [name, blockContent] of Object.entries(managedBlocks)) {
    content = upsertManagedBlock(content, name, blockContent);
  }
  writeText(filePath, content);
}

function retireStaleConceptPages(root, conceptMap) {
  const activeConcepts = new Set([...conceptMap.keys()].map((concept) => normalizeConceptLabel(concept)));
  const conceptNotes = loadNotes(root, "wiki/concepts").filter((note) => !/\/index\.md$/i.test(note.relativePath));
  let retired = 0;

  for (const note of conceptNotes) {
    if (note.frontmatter.kind !== "concept-page") {
      continue;
    }
    const normalizedTitle = normalizeConceptLabel(note.frontmatter.title || note.title);
    if (!normalizedTitle || activeConcepts.has(normalizedTitle)) {
      continue;
    }

    const frontmatter = {
      ...note.frontmatter,
      status: "retired"
    };
    writeText(note.path, renderMarkdown(frontmatter, note.body));
    retired += 1;
  }

  return retired;
}

function upsertConceptPages(root, conceptMap) {
  const rows = ["# Concept Index", "", `Generated: ${dateStamp()}`, ""];
  for (const concept of [...conceptMap.keys()].sort()) {
    const slug = slugify(concept);
    const notePath = path.join(root, "wiki", "concepts", `${slug}.md`);
    const notes = conceptMap.get(concept).sort((a, b) => a.title.localeCompare(b.title));
    const evidence = notes.map((note) => `- ${toWikiLink(note.relativePath, note.title)}`).join("\n");
    const synthesis = notes.map((note) => `- ${note.title}: ${noteSummary(note, 180)}`).join("\n");
    const relatedEntities = [...new Set(notes.flatMap((note) => normalizeList(note.frontmatter.entities)))];
    const chronology = notes
      .filter((note) => note.frontmatter.date)
      .sort((left, right) => String(left.frontmatter.date).localeCompare(String(right.frontmatter.date)))
      .map((note) => `- ${note.frontmatter.date}: ${toWikiLink(note.relativePath, note.title)}`)
      .join("\n");

    ensureManagedNote(
      notePath,
      {
        id: `CONCEPT-${new Date().getUTCFullYear()}-${slug.toUpperCase().slice(0, 24)}`,
        kind: "concept-page",
        title: concept,
        status: "active",
        tags: [],
        related: []
      },
      concept,
      `
# ${concept}

## Definition

## Core Mechanism

## Why It Matters

## Competing Interpretations

## Common Misconceptions

## Related Topics

## Open Questions
`,
      {
        evidence: `## Managed Evidence\n\n${evidence}`,
        synthesis: `## Managed Synthesis\n\n${synthesis}`,
        entities: `## Managed Related Entities\n\n${relatedEntities.length ? relatedEntities.map((entity) => `- [[entities/${slugify(entity)}|${entity}]]`).join("\n") : "- None linked yet."}`,
        chronology: `## Managed Chronology\n\n${chronology || "- No dated source chronology available yet."}`
      }
    );

    rows.push(`- ${toWikiLink(relativeToRoot(root, notePath), concept)} (${notes.length} sources)`);
  }
  rows.push("");
  writeText(path.join(root, "wiki", "_indices", "concepts.md"), `${rows.join("\n").trim()}\n`);
}

function upsertEntityPages(root, entityMap) {
  const rows = ["# Entity Index", "", `Generated: ${dateStamp()}`, ""];
  for (const entity of [...entityMap.keys()].sort()) {
    const slug = slugify(entity);
    const notePath = path.join(root, "wiki", "entities", `${slug}.md`);
    const notes = entityMap.get(entity).sort((a, b) => a.title.localeCompare(b.title));
    const evidence = notes.map((note) => `- ${toWikiLink(note.relativePath, note.title)}`).join("\n");
    const linkedConcepts = [...new Set(notes.flatMap((note) => normalizeList(note.frontmatter.concepts)))];
    const chronology = notes
      .filter((note) => note.frontmatter.date)
      .sort((left, right) => String(left.frontmatter.date).localeCompare(String(right.frontmatter.date)))
      .map((note) => `- ${note.frontmatter.date}: ${toWikiLink(note.relativePath, note.title)}`)
      .join("\n");

    ensureManagedNote(
      notePath,
      {
        id: `ENTITY-${new Date().getUTCFullYear()}-${slug.toUpperCase().slice(0, 24)}`,
        kind: "entity-page",
        title: entity,
        entity_type: "entity",
        status: "active",
        tags: [],
        related: []
      },
      entity,
      `
# ${entity}

## What It Is

## Why It Matters

## Open Issues
`,
      {
        concepts: `## Managed Linked Concepts\n\n${linkedConcepts.length ? linkedConcepts.map((concept) => `- [[concepts/${slugify(concept)}|${concept}]]`).join("\n") : "- None linked yet."}`,
        evidence: `## Managed Related Sources\n\n${evidence}`,
        chronology: `## Managed Key Events / Timeline\n\n${chronology || "- No dated evidence available yet."}`
      }
    );

    rows.push(`- ${toWikiLink(relativeToRoot(root, notePath), entity)} (${notes.length} sources)`);
  }
  rows.push("");
  writeText(path.join(root, "wiki", "_indices", "entities.md"), `${rows.join("\n").trim()}\n`);
}

function buildSelfModelIndex(root) {
  const selfNotes = listMarkdownNotes(root, "wiki/self").filter((filePath) => !filePath.endsWith("README.md"));
  const byFolder = new Map();
  for (const filePath of selfNotes) {
    const relative = relativeToRoot(root, filePath);
    const folder = relative.split("/").slice(2, 3)[0] || "other";
    const raw = readText(filePath);
    const { frontmatter } = parseFrontmatter(raw);
    const title = frontmatter.title || path.basename(filePath, ".md");
    if (!byFolder.has(folder)) {
      byFolder.set(folder, []);
    }
    byFolder.get(folder).push({ relative, title });
  }

  const lines = ["# Self-Model Index", "", `Generated: ${dateStamp()}`, ""];
  for (const folder of [...byFolder.keys()].sort()) {
    lines.push(`## ${folder}`);
    for (const note of byFolder.get(folder).sort((a, b) => a.title.localeCompare(b.title))) {
      lines.push(`- ${toWikiLink(note.relative, note.title)}`);
    }
    lines.push("");
  }

  writeText(path.join(root, "wiki", "_indices", "self-model.md"), `${lines.join("\n").trim()}\n`);
}

function buildTimelineIndex(root, sourceNotes) {
  const dated = sourceNotes
    .filter((note) => note.frontmatter.date)
    .sort((left, right) => String(left.frontmatter.date).localeCompare(String(right.frontmatter.date)));
  const lines = ["# Source Chronology", "", `Generated: ${dateStamp()}`, ""];
  if (!dated.length) {
    lines.push("- No dated source notes yet.");
  } else {
    for (const note of dated) {
      lines.push(`- ${note.frontmatter.date}: ${toWikiLink(note.relativePath, note.title)} (${note.frontmatter.source_type || "source"})`);
    }
  }
  lines.push("");
  writeText(path.join(root, "wiki", "timelines", "source-chronology.md"), `${lines.join("\n").trim()}\n`);
}

function buildPotentialContradictions(root, conceptMap) {
  const lines = ["# Potential Contradictions", "", `Generated: ${dateStamp()}`, ""];
  let count = 0;

  for (const concept of [...conceptMap.keys()].sort()) {
    const notes = conceptMap.get(concept);
    if (notes.length < 2) {
      continue;
    }
    const lowerNotes = notes.map((note) => ({
      note,
      text: noteSummary(note, 240).toLowerCase()
    }));
    const positives = lowerNotes.filter((entry) => POSITIVE_CUES.some((cue) => entry.text.includes(cue)));
    const negatives = lowerNotes.filter((entry) => NEGATIVE_CUES.some((cue) => entry.text.includes(cue)));

    if (!positives.length || !negatives.length) {
      continue;
    }

    count += 1;
    lines.push(`## ${concept}`);
    lines.push("- Positive-leaning evidence:");
    for (const entry of positives.slice(0, 3)) {
      lines.push(`  - ${toWikiLink(entry.note.relativePath, entry.note.title)}`);
    }
    lines.push("- Negative-leaning evidence:");
    for (const entry of negatives.slice(0, 3)) {
      lines.push(`  - ${toWikiLink(entry.note.relativePath, entry.note.title)}`);
    }
    lines.push("");
  }

  if (!count) {
    lines.push("- No contradiction candidates detected from the current heuristic pass.");
    lines.push("");
  }

  writeText(path.join(root, "wiki", "unresolved", "potential-contradictions.md"), `${lines.join("\n").trim()}\n`);
  return count;
}

function buildSynthesisCandidates(root, conceptMap) {
  const candidates = [...conceptMap.entries()]
    .filter(([, notes]) => notes.length >= 3)
    .sort((left, right) => right[1].length - left[1].length || left[0].localeCompare(right[0]));
  const candidateLines = ["# Synthesis Candidates", "", `Generated: ${dateStamp()}`, ""];

  if (!candidates.length) {
    candidateLines.push("- No concept has enough repeated evidence yet to suggest a synthesis page.");
  } else {
    for (const [concept, notes] of candidates) {
      candidateLines.push(`- [[concepts/${slugify(concept)}|${concept}]] (${notes.length} sources)`);
    }
  }
  candidateLines.push("");
  writeText(path.join(root, "wiki", "unresolved", "synthesis-candidates.md"), `${candidateLines.join("\n").trim()}\n`);

  const synthesisNotes = loadNotes(root, "wiki/synthesis").filter((note) => !/\/index\.md$/i.test(note.relativePath));
  const indexLines = ["# Synthesis Index", "", `Generated: ${dateStamp()}`, "", "## Existing Synthesis Notes"];
  if (!synthesisNotes.length) {
    indexLines.push("- None yet.");
  } else {
    for (const note of synthesisNotes.sort((a, b) => a.title.localeCompare(b.title))) {
      indexLines.push(`- ${toWikiLink(note.relativePath, note.title)}`);
    }
  }
  indexLines.push("");
  indexLines.push("## Promotion Opportunities");
  if (!candidates.length) {
    indexLines.push("- None yet.");
  } else {
    for (const [concept, notes] of candidates.slice(0, 12)) {
      indexLines.push(`- [[concepts/${slugify(concept)}|${concept}]] (${notes.length} sources)`);
    }
  }
  indexLines.push("");
  writeText(path.join(root, "wiki", "synthesis", "index.md"), `${indexLines.join("\n").trim()}\n`);
  return candidates.length;
}

function buildUnresolvedRegisters(root, sourceNotes, conceptMap) {
  const extractionGaps = sourceNotes.filter((note) => !note.frontmatter.extracted_text_path);
  const classificationGaps = sourceNotes.filter(
    (note) => normalizeList(note.frontmatter.concepts).length === 0 && normalizeList(note.frontmatter.entities).length === 0
  );

  const extractionLines = ["# Extraction Gaps", ""];
  if (!extractionGaps.length) {
    extractionLines.push("- None.");
  } else {
    for (const note of extractionGaps) {
      extractionLines.push(`- ${toWikiLink(note.relativePath, note.title)} - ${note.frontmatter.source_type}`);
    }
  }

  const classificationLines = ["# Source Notes Needing Classification", ""];
  if (!classificationGaps.length) {
    classificationLines.push("- None.");
  } else {
    for (const note of classificationGaps) {
      classificationLines.push(`- ${toWikiLink(note.relativePath, note.title)}`);
    }
  }

  writeText(path.join(root, "wiki", "unresolved", "extraction-gaps.md"), `${extractionLines.join("\n").trim()}\n`);
  writeText(path.join(root, "wiki", "unresolved", "classification-gaps.md"), `${classificationLines.join("\n").trim()}\n`);

  return {
    extractionGaps: extractionGaps.length,
    classificationGaps: classificationGaps.length,
    contradictionCandidates: buildPotentialContradictions(root, conceptMap),
    synthesisCandidates: buildSynthesisCandidates(root, conceptMap)
  };
}

function buildDomainMapPage(root, relativePath, title, sections) {
  const targetPath = path.join(root, relativePath);
  const current = fs.existsSync(targetPath) ? readText(targetPath) : `# ${title}\n`;
  const blockLines = [`# ${title}`, "", `Generated: ${dateStamp()}`, ""];
  for (const section of sections) {
    blockLines.push(`## ${section.title}`);
    blockLines.push(section.lines.length ? section.lines.join("\n") : "- None yet.");
    blockLines.push("");
  }
  writeText(targetPath, upsertManagedBlock(current, "index", blockLines.join("\n").trim()));
}

function buildDomainMaps(root, sourceNotes) {
  const ontology = readJson(path.join(root, "config", "ontology.json"), {});
  const lowerNotes = sourceNotes.map((note) => ({
    ...note,
    searchText: `${note.title}\n${normalizeList(note.frontmatter.concepts).join(" ")}\n${normalizeList(note.frontmatter.tags).join(" ")}\n${noteSummary(note, 260)}`.toLowerCase()
  }));

  const domainMappings = [
    ["macro", "wiki/macro/index.md", "Macro"],
    ["market_structure", "wiki/market-structure/index.md", "Market Structure"],
    ["derivatives", "wiki/derivatives/index.md", "Derivatives"]
  ];

  for (const [domainKey, relativePath, title] of domainMappings) {
    const terms = ontology.domains?.[domainKey] || [];
    const sections = terms.map((term) => {
      const matches = lowerNotes.filter((note) => note.searchText.includes(String(term).toLowerCase()));
      return {
        title: term,
        lines: matches.slice(0, 8).map((note) => `- ${toWikiLink(note.relativePath, note.title)}`)
      };
    });
    buildDomainMapPage(root, relativePath, title, sections);
  }
}

function buildCollectionIndex(root, relativeDir, title) {
  const notes = loadNotes(root, relativeDir).filter((note) => !/\/index\.md$/i.test(note.relativePath));
  const lines = [`# ${title}`, "", `Generated: ${dateStamp()}`, ""];
  if (!notes.length) {
    lines.push("- None yet.");
  } else {
    for (const note of notes.sort((a, b) => a.title.localeCompare(b.title))) {
      lines.push(`- ${toWikiLink(note.relativePath, note.title)}`);
    }
  }
  lines.push("");
  writeText(path.join(root, relativeDir, "index.md"), `${lines.join("\n").trim()}\n`);
  return notes.length;
}

function countCollectionNotes(root, relativeDir, options = {}) {
  return loadNotes(root, relativeDir).filter((note) => {
    if (/\/index\.md$/i.test(note.relativePath)) {
      return false;
    }
    if (options.exclude && options.exclude.test(note.relativePath)) {
      return false;
    }
    return true;
  }).length;
}

function buildTagIndex(root, tagSummary) {
  const lines = ["# Tag Index", "", `Generated: ${dateStamp()}`, ""];
  if (!tagSummary.length) {
    lines.push("- No tags recorded yet.");
  } else {
    for (const tag of tagSummary) {
      lines.push(`## ${tag.labels[0]}`);
      lines.push(`- Uses: ${tag.count}`);
      if (tag.labels.length > 1) {
        lines.push(`- Variants: ${tag.labels.join(", ")}`);
      }
      lines.push(
        ...tag.notes.slice(0, 12).map((relativePath) =>
          `- ${toWikiLink(relativePath, relativePath.split("/").pop().replace(/\.md$/i, ""))}`
        )
      );
      lines.push("");
    }
  }
  writeText(path.join(root, "wiki", "_indices", "tags.md"), `${lines.join("\n").trim()}\n`);
}

function buildBacklinkIndex(root, catalogNotes, backlinks) {
  const lines = ["# Backlink Index", "", `Generated: ${dateStamp()}`, ""];
  const ranked = catalogNotes
    .filter((note) => !/\/(?:index|README)\.md$/i.test(note.relativePath))
    .map((note) => ({
      note,
      backlinks: backlinks.get(note.relativePath) || []
    }))
    .sort((left, right) => right.backlinks.length - left.backlinks.length || left.note.title.localeCompare(right.note.title));

  if (!ranked.length) {
    lines.push("- No notes indexed yet.");
  } else {
    for (const entry of ranked.slice(0, 80)) {
      lines.push(`## ${entry.note.title}`);
      lines.push(`- Path: \`${entry.note.relativePath}\``);
      lines.push(`- Backlinks: ${entry.backlinks.length}`);
      lines.push(
        ...(entry.backlinks.length
          ? entry.backlinks.slice(0, 12).map((relativePath) => `- Linked from ${toWikiLink(relativePath)}`)
          : ["- No inbound links detected yet."])
      );
      lines.push("");
    }
  }

  writeText(path.join(root, "wiki", "_indices", "backlinks.md"), `${lines.join("\n").trim()}\n`);
}

function buildOpenThreadsRegister(root, catalogNotes) {
  const lines = ["# Open Threads", "", `Generated: ${dateStamp()}`, ""];
  let count = 0;

  for (const note of catalogNotes
    .filter((entry) => entry.openThreads.length)
    .sort((left, right) => left.title.localeCompare(right.title))) {
    count += note.openThreads.length;
    lines.push(`## ${note.title}`);
    lines.push(`- Note: ${toWikiLink(note.relativePath, note.title)}`);
    for (const thread of note.openThreads.slice(0, 8)) {
      lines.push(`- ${thread.heading}: ${thread.text}`);
    }
    lines.push("");
  }

  if (!count) {
    lines.push("- No explicit open threads were extracted from the current note set.");
    lines.push("");
  }

  writeText(path.join(root, "wiki", "unresolved", "open-threads.md"), `${lines.join("\n").trim()}\n`);
  return count;
}

function buildDraftWorkspaceIndex(root, catalogNotes) {
  const drafts = catalogNotes
    .filter((note) => note.kind === "draft-note" && !/\/index\.md$/i.test(note.relativePath))
    .sort((left, right) => left.title.localeCompare(right.title));
  const lines = ["# Draft Workspace Index", "", `Generated: ${dateStamp()}`, "", "## Append And Review Queue"];

  if (!drafts.length) {
    lines.push("- No draft workspace notes are open.");
  } else {
    for (const draft of drafts) {
      lines.push(`- ${toWikiLink(draft.relativePath, draft.title)} (${draft.frontmatter.document_class || "working_note"})`);
    }
  }
  lines.push("");

  writeText(path.join(root, "wiki", "drafts", "index.md"), `${lines.join("\n").trim()}\n`);
  writeText(path.join(root, "wiki", "drafts", "append-review", "index.md"), `${lines.join("\n").trim()}\n`);
  return drafts.length;
}

function writeStructuredCatalog(root, catalogNotes, backlinks, tagSummary) {
  writeJson(path.join(root, "manifests", "wiki_index.json"), {
    generated_at: nowIso(),
    notes: catalogNotes.map((note) => ({
      relative_path: note.relativePath,
      title: note.title,
      kind: note.kind,
      status: note.status,
      tags: note.tags,
      backlinks: backlinks.get(note.relativePath) || [],
      summary: summaryText(note),
      document_class: note.frontmatter.document_class || "",
      freshness: note.freshness,
      open_threads: note.openThreads
    })),
    tags: tagSummary
  });
}

function updateHomePage(root, stats) {
  const homePath = path.join(root, "wiki", "_maps", "home.md");
  const current = readText(homePath);
  const managed = `
## Managed Overview

- Source notes: ${stats.sourceNotes}
- Claims: ${stats.claims}
- Contested claims: ${stats.contestedClaims}
- Concepts: ${stats.concepts}
- Entities: ${stats.entities}
- Timelines: ${stats.timelines}
- States: ${stats.states}
- Regimes: ${stats.regimes}
- Decisions: ${stats.decisions}
- Thesis pages: ${stats.theses}
- Watch profiles: ${stats.watchProfiles}
- Surveillance pages: ${stats.surveillance}
- Self notes: ${stats.selfNotes}
- Draft workspace notes: ${stats.drafts}
- Contradiction candidates: ${stats.contradictions}
- Synthesis candidates: ${stats.synthesisCandidates}
- Open threads: ${stats.openThreads}
- Last compiled: ${new Date().toISOString()}
`;
  writeText(homePath, upsertManagedBlock(current, "overview", managed));
}

function compileProject(root, options = {}) {
  ensureProjectStructure(root);
  let sourceNotes = loadNotes(root, "wiki/source-notes");
  const sourceRoutingBackfills = backfillSourceRouting(root, sourceNotes);
  if (sourceRoutingBackfills) {
    sourceNotes = loadNotes(root, "wiki/source-notes");
  }
  const ontology = readJson(path.join(root, "config", "ontology.json"), {});
  const ontologyIndex = buildConceptOntologyIndex(ontology);
  buildSourceIndex(root, sourceNotes);

  const conceptMap = buildConceptRecords(sourceNotes, { ...options, ontologyIndex });
  const entityMap = buildEntityRecords(sourceNotes);
  upsertConceptPages(root, conceptMap);
  retireStaleConceptPages(root, conceptMap);
  upsertEntityPages(root, entityMap);
  const claimSummary = refreshClaims(root, { writeSnapshot: false });
  buildSelfModelIndex(root);
  buildTimelineIndex(root, sourceNotes);
  buildDomainMaps(root, sourceNotes);
  const unresolved = buildUnresolvedRegisters(root, sourceNotes, conceptMap);
  const claimCount = countCollectionNotes(root, "wiki/claims", { exclude: /\/contested\.md$/i });
  const stateCount = buildCollectionIndex(root, "wiki/states", "State Index");
  const regimeCount = buildCollectionIndex(root, "wiki/regimes", "Regime Index");
  const decisionCount = buildCollectionIndex(root, "wiki/decisions", "Decision Index");
  const thesisCount = buildCollectionIndex(root, "wiki/theses", "Thesis Index");
  const watchProfileCount = buildCollectionIndex(root, "wiki/watch-profiles", "Watch Profile Index");
  const surveillanceCount = buildCollectionIndex(root, "wiki/surveillance", "Surveillance Index");
  const selfCount = buildCollectionIndex(root, "wiki/self", "Self Index");
  const watchProfiles = loadWatchProfiles(root);
  buildWatchProfileArtifacts(root, watchProfiles);
  const catalogNotes = loadCatalogNotes(root);
  const catalogGraph = buildCatalogGraph(catalogNotes);
  const tagSummary = buildTagSummary(catalogNotes);
  buildTagIndex(root, tagSummary);
  buildBacklinkIndex(root, catalogNotes, catalogGraph.backlinks);
  const openThreadCount = buildOpenThreadsRegister(root, catalogNotes);
  const draftCount = buildDraftWorkspaceIndex(root, catalogNotes);
  writeStructuredCatalog(root, catalogNotes, catalogGraph.backlinks, tagSummary);

  updateHomePage(root, {
    sourceNotes: sourceNotes.length,
    sourceRoutingBackfills,
    claims: claimCount,
    contestedClaims: claimSummary.contested,
    concepts: conceptMap.size,
    entities: entityMap.size,
    timelines: fs.existsSync(path.join(root, "wiki", "timelines", "source-chronology.md")) ? 1 : 0,
    states: stateCount,
    regimes: regimeCount,
    decisions: decisionCount,
    theses: thesisCount,
    watchProfiles: watchProfileCount,
    surveillance: surveillanceCount,
    selfNotes: selfCount,
    drafts: draftCount,
    contradictions: unresolved.contradictionCandidates,
    synthesisCandidates: unresolved.synthesisCandidates,
    openThreads: openThreadCount
  });

  return {
    sourceNotes: sourceNotes.length,
    sourceRoutingBackfills,
    claims: claimCount,
    contestedClaims: claimSummary.contested,
    concepts: conceptMap.size,
    entities: entityMap.size,
    timelines: 1,
    statePages: stateCount,
    regimePages: regimeCount,
    decisionPages: decisionCount,
    thesisPages: thesisCount,
    watchProfiles: watchProfileCount,
    surveillancePages: surveillanceCount,
    draftPages: draftCount,
    openThreads: openThreadCount,
    contradictionCandidates: unresolved.contradictionCandidates,
    synthesisCandidates: unresolved.synthesisCandidates
  };
}

module.exports = {
  compileProject
};
