const { truncate } = require("./utils");

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

function normalizeText(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function detectDocumentClass(sourceType, title, extractedText, frontmatter = {}, targetKind = "file") {
  const explicit = String(frontmatter.document_class || "").trim();
  if (explicit) {
    return explicit;
  }

  const combined = normalizeText(`${title}\n${extractedText}\n${frontmatter.capture_notes || ""}\n${frontmatter.tags || ""}`);

  if (targetKind === "directory" || sourceType === "repo") {
    return "repository_snapshot";
  }
  if (sourceType === "dataset") {
    return combined.includes("survey") || combined.includes("release") ? "data_release" : "dataset_snapshot";
  }
  if (sourceType === "image") {
    if (/\b(chart|figure|heatmap|slide|deck|screen|screenshot|presentation)\b/.test(combined)) {
      return "chartpack_or_visual";
    }
    return "visual_capture";
  }
  if (/\b(transcript|earnings call|q&a|podcast|interview|webinar|fireside)\b/.test(combined) || sourceType === "transcript") {
    return "transcript";
  }
  if (/\b(minutes|meeting|agenda|standup|discussion notes|action items)\b/.test(combined)) {
    return "meeting_notes";
  }
  if (/\b(memo|brief|deck|outline|thesis|investment case|decision)\b/.test(combined)) {
    return "internal_memo";
  }
  if (/\b(10-k|10q|10-q|8-k|annual report|quarterly report|results|shareholder|filing)\b/.test(combined)) {
    return "filing_or_company_update";
  }
  if (/\b(cpi|payrolls|ism|pmi|gdp|auction|inflation report|macro release|data release)\b/.test(combined)) {
    return "macro_data_release";
  }
  if (/\b(reuters|bloomberg|breaking|update|announces|news|headline)\b/.test(combined)) {
    return "news_update";
  }
  if (sourceType === "paper" || /\b(paper|study|white paper|research|methodology)\b/.test(combined)) {
    return "research_note";
  }
  if (sourceType === "article" || sourceType === "web") {
    return "article_or_web_capture";
  }
  return "working_note";
}

function reviewLensForDocumentClass(documentClass) {
  switch (documentClass) {
    case "repository_snapshot":
      return "Treat this as structural evidence. Review repo shape, entry points, and assumptions before drawing product conclusions.";
    case "dataset_snapshot":
    case "data_release":
    case "macro_data_release":
      return "Validate units, sample period, provenance, and whether the data is first-hand or republished.";
    case "chartpack_or_visual":
    case "visual_capture":
      return "Do not rely on OCR alone. Revisit the source image or nearby text before promoting any chart conclusion.";
    case "transcript":
      return "Separate speaker claims, guidance, and tone from what is actually evidenced elsewhere.";
    case "meeting_notes":
      return "Extract decisions, action items, and unresolved questions. Do not promote brainstorming as settled knowledge.";
    case "internal_memo":
      return "Treat this as interpreted analysis. Split facts, estimates, and judgements before reusing it.";
    case "filing_or_company_update":
      return "Prioritise management guidance, accounting changes, and disclosed risks over narrative colour.";
    case "news_update":
      return "Prefer primary confirmation before promoting any claim that materially changes the view.";
    case "research_note":
      return "Check methodology, sample limits, and whether the argument travels outside the paper's frame.";
    default:
      return "Use append-and-review discipline. Keep raw capture, candidate links, and unresolved questions explicit.";
  }
}

function reviewChecklist(documentClass) {
  const defaults = [
    "Verify the extracted summary against the raw source before promoting any durable claim.",
    "Link the source to the right concepts, entities, or watch subjects.",
    "Write down the strongest counter-reading, not just the base-case interpretation."
  ];

  const classSpecific = {
    repository_snapshot: [
      "Confirm the repo entry points, package manager, and runtime assumptions.",
      "Separate implemented capability from aspirational README language."
    ],
    dataset_snapshot: [
      "Check field definitions, date coverage, and whether revisions or restatements matter."
    ],
    data_release: [
      "Confirm the release timing, frequency, and whether the release is preliminary or revised."
    ],
    macro_data_release: [
      "Record the print, prior, revision risk, and why the release matters for markets."
    ],
    chartpack_or_visual: [
      "Re-open the chart or figure and verify any OCR-derived numbers or labels manually."
    ],
    transcript: [
      "Separate prepared remarks, Q&A, and any forward-looking claims that need external confirmation."
    ],
    meeting_notes: [
      "Preserve explicit action items and unresolved questions; do not collapse them into a fake conclusion."
    ],
    internal_memo: [
      "Mark which parts are facts, estimates, and judgements before reusing the note downstream."
    ],
    filing_or_company_update: [
      "Capture disclosed risks, guidance, capital allocation, and any changes versus prior filings."
    ],
    news_update: [
      "Look for direct primary-source confirmation if the headline would change the current state materially."
    ],
    research_note: [
      "Capture methodology, sample limits, and the conditions under which the result would fail."
    ]
  };

  return defaults.concat(classSpecific[documentClass] || []);
}

function buildAppendReviewBody(record, extraction) {
  const excerpt = truncate(String(extraction.extractedText || "").replace(/\s+/g, " ").trim(), 1400);
  const concepts = record.candidate_concepts.length
    ? record.candidate_concepts.map((concept) => `- ${concept}`).join("\n")
    : "- None suggested automatically yet.";
  const tags = normalizeList(record.tags).length
    ? normalizeList(record.tags).map((tag) => `- ${tag}`).join("\n")
    : "- No initial tags captured.";

  return `
# Append And Review: ${record.title}

## Working Capture

${record.summary}

## Document Route

- Document class: \`${record.document_class}\`
- Review lens: ${record.review_lens}
- Source note: \`${record.note_path}\`
- Raw path: \`${record.raw_path}\`

## Review Checklist

${reviewChecklist(record.document_class).map((item) => `- [ ] ${item}`).join("\n")}

## Candidate Concepts

${concepts}

## Candidate Tags

${tags}

## Working Counter-Read

- What is the strongest reasonable alternative interpretation of this source?
- Which part of the current summary is likely to be overconfident or incomplete?

## Open Questions

- What would have to be verified before this source informs claims, states, or decisions?
- Which opposing or primary sources should be paired with this one?

## Raw Extraction Snapshot

${excerpt || "- No extracted text was available in the current runtime."}

## Provenance

- Metadata path: \`${record.metadata_path}\`
- Extraction status: \`${record.extraction_status}\`
- Extraction method: \`${record.extraction_method}\`
- Preserve this draft note as append-and-review workspace, not as settled knowledge.
`;
}

module.exports = {
  buildAppendReviewBody,
  detectDocumentClass,
  normalizeList,
  reviewChecklist,
  reviewLensForDocumentClass
};
