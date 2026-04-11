const fs = require("node:fs");
const path = require("node:path");
const { captureTerminalModelBundle, writePackArtifacts } = require("../handoff-core");
const { makeLocalSource, resolvePackContext, summarizeLocalSources, uniqueLocalSources } = require("../pack-runtime");
const {
  confidenceLabel,
  evidenceBullets,
  renderRetrievalBudgetBlock,
  renderResultReference,
  retrieveEvidence,
  synthesisParagraphs
} = require("../research");
const { searchClaims } = require("../claims");
const { parseFrontmatter, stripMarkdownFormatting } = require("../markdown");
const { searchCorpus } = require("../search");
const { renderSelfModelMarkdownBlock, serializeSelfModelContext } = require("../self-model");
const { refreshState } = require("../states");
const { appendJsonl, moveFile, nowIso, readText, relativeToRoot, slugify, truncate, uniquePath, writeText } = require("../utils");
const { resolveWatchSubject } = require("../watch");

const GROUNDED_EXCLUDE_PREFIXES = [
  "outputs/",
  "wiki/probabilities/",
  "wiki/surveillance/",
  "wiki/_indices/",
  "wiki/_maps/",
  "wiki/unresolved/",
  "wiki/drafts/",
  "wiki/self/",
  "wiki/timelines/source-chronology.md"
];

const INVESTMENT_SECTION_PLAN = [
  {
    key: "macro-regime",
    heading: "Macro / Regime",
    query: "global macro regime energy shock stagflation inflation growth oil middle east de-escalation",
    budget: "L2",
    limit: 5
  },
  {
    key: "rates-duration",
    heading: "Rates / Duration",
    query: "rates duration bond supply term premia government bonds gilts treasuries policy rates",
    budget: "L2",
    limit: 5
  },
  {
    key: "equities-ai",
    heading: "Equities / AI",
    query: "equities AI tech software indices US Asia leadership megacap",
    budget: "L2",
    limit: 5
  },
  {
    key: "sector-defensives",
    heading: "Sector / Defensive Rotation",
    query: "sector performance health care insurance automotive defensives energy price spike",
    budget: "L2",
    limit: 5
  },
  {
    key: "credit-liquidity",
    heading: "Credit / Liquidity",
    query: "private credit credit spreads liquidity concentration risk hyperscaler software debt",
    budget: "L2",
    limit: 5
  },
  {
    key: "fx-commodities-em",
    heading: "FX / Commodities / EM",
    query: "US dollar yen commodities oil emerging markets capital flows EM spreads",
    budget: "L2",
    limit: 5
  }
];

const INVESTMENT_EVIDENCE_PREFIXES = [
  "wiki/source-notes/",
  "outputs/briefs/",
  "outputs/meeting-briefs/",
  "outputs/memos/"
];

const INVESTMENT_CANONICAL_PREFIXES = [
  "wiki/states/",
  "wiki/decisions/",
  "wiki/theses/"
];

const INVESTMENT_RAW_PREFIXES = ["extracted/text/"];

const INVESTMENT_SECTION_IMPLICATIONS = {
  "macro-regime":
    "Portfolio read-through: the regime is investable, but it is more fragile and inflation-sensitive than a clean broad risk-on backdrop.",
  "rates-duration":
    "Portfolio read-through: treat duration tactically rather than assuming the long end automatically provides safety.",
  "equities-ai":
    "Portfolio read-through: separate AI and high-quality growth leadership from indiscriminate equity beta.",
  "sector-defensives":
    "Portfolio read-through: quality defensives deserve more respect than deep cyclical beta while the energy path is still unsettled.",
  "credit-liquidity":
    "Portfolio read-through: underwriting discipline matters more than reach-for-yield behaviour when concentration risk is this visible.",
  "fx-commodities-em":
    "Portfolio read-through: oil, the dollar, and EM flows are the first places to check when cross-asset pressure starts to rebuild."
};

const INVESTMENT_SECTION_PRIORITY_PATTERNS = {
  "macro-regime": /macro|economics|energy|inflation|regime|conflict/i,
  "rates-duration": /bond|duration|rates|treasur|gilt|yield|supply|term premia/i,
  "equities-ai": /equities|ai|software|technology|tech|us equities/i,
  "sector-defensives": /health care|healthcare|insurance|automotive|defensive|sector/i,
  "credit-liquidity": /private credit|credit|liquidity|hyperscaler|spread/i,
  "fx-commodities-em": /emerging markets|capital flows|dollar|fx|commodit|oil|currenc/i
};

const REPORT_TEXT_REPLACEMENTS = [
  [/â€¢/g, "- "],
  [/â–ª|▪/g, "- "],
  [/â€¦/g, "..."],
  [/â€“|â€”/g, "-"],
  [/â€˜|â€™/g, "'"],
  [/â€œ|â€/g, '"'],
  [/Â/g, ""]
];

const TAKEAWAY_IGNORE_PATTERNS = [
  /^Reviewed\b/i,
  /reviewed against the extracted text/i,
  /use this note for grounded qualitative synthesis/i,
  /revisit the raw pdf/i,
  /batch-authored by codex/i,
  /initial batch capture authored/i,
  /add image, table, or figure-specific notes/i,
  /what concepts should this source strengthen/i,
  /what is still ambiguous or unverified/i,
  /what is the strongest counter-reading/i,
  /metadata path:/i,
  /extraction status:/i,
  /extraction method:/i,
  /^key takeaways$/i,
  /review lens:/i,
  /preserve the raw source as the anchor of truth/i,
  /^power bi desktop$/i,
  /^thematic research$/i,
  /^marketing communication/i,
  /^for professional investors only/i,
  /^distribution:/i,
  /^disclaimer:/i,
  /@.+\./i,
  /not intended to be investment advice/i,
  /these categorizations represent the current good-faith views/i
];

const TAKEAWAY_STOP_PATTERNS = [/^chart \d+:/i, /^sources?:/i, /^disclaimer:/i, /^distribution:/i, /page \d+$/i];

const SOURCE_SENTENCE_OPENERS = [
  "The most useful anchor is",
  "A second useful source is",
  "A third useful source is"
];

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeReportText(value) {
  let text = String(value || "");
  for (const [pattern, replacement] of REPORT_TEXT_REPLACEMENTS) {
    text = text.replace(pattern, replacement);
  }
  return text.replace(/\u00a0/g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();
}

function cleanTakeawayText(value) {
  const normalized = normalizeReportText(stripMarkdownFormatting(String(value || "")))
    .replace(/^[-*•]\s*/, "")
    .replace(/^Summary\s*/i, "")
    .replace(/^com\s+/i, "")
    .replace(/Positive \(\+\) or Negative \(-\) Implications/gi, "")
    .replace(/\(\+\)\s*/g, "")
    .replace(/\(-\)\s*/g, "")
    .replace(/â–ª|▪/g, "")
    .replace(/\.\s+[A-Z][A-Za-z&.'-]+(?:\s+[A-Z][A-Za-z&.'-]+){0,5}\s+(?:Inc\.|Corp\.|Corporation|Company|Limited|Ltd\.|Holdings|Group|Technologies|Systems|N\.V\.|SE|Co\.\s*Ltd\.)\.?\s+/g, ". ")
    .replace(/\b[A-Z][A-Za-z&.'-]+(?:\s+[A-Z][A-Za-z&.'-]+){0,5}\s+(?:Inc\.|Corp\.|Corporation|Company|Limited|Ltd\.|Holdings|Group|Technologies|Systems|N\.V\.|SE|Co\.\s*Ltd\.)\b(?:\s*\([A-Z.]+\))?/g, "")
    .replace(/^\.\.\./, "")
    .replace(/\.\.\.$/, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return "";
  }
  if (TAKEAWAY_IGNORE_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return "";
  }

  const sentences = normalized.match(/[^.!?]+[.!?]?/g) || [normalized];
  const compact = sentences
    .slice(0, 2)
    .join(" ")
    .replace(/\s+/g, " ")
    .replace(/\s+[A-Z][A-Za-z&.'-]+(?:\s+[A-Z][A-Za-z&.'-]+){0,5}\s+(?:Inc\.|Corp\.|Corporation|Company|Limited|Ltd\.|Holdings|Group|Technologies|Systems|N\.V\.|SE|Co\.\s*Ltd\.)\.?$/g, "")
    .trim();

  return /[.!?]$/.test(compact) ? compact : `${compact}.`;
}

function extractMarkdownSection(body, heading) {
  const match = String(body || "").match(
    new RegExp(`^##\\s+${escapeRegExp(heading)}\\s*$([\\s\\S]*?)(?=^##\\s+|(?![\\s\\S]))`, "m")
  );
  return match ? match[1].trim() : "";
}

function extractMarkdownBullets(sectionText) {
  const takeaways = [];
  let current = "";
  for (const rawLine of String(sectionText || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      if (current) {
        takeaways.push(current);
        current = "";
      }
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      if (current) {
        takeaways.push(current);
      }
      current = line.replace(/^[-*]\s+/, "");
      continue;
    }
    if (current) {
      current += ` ${line}`;
    }
  }
  if (current) {
    takeaways.push(current);
  }
  return takeaways.map(cleanTakeawayText).filter(Boolean);
}

function extractSentences(value) {
  const cleaned = normalizeReportText(String(value || ""))
    .replace(/^Summary\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) {
    return [];
  }

  const matches = cleaned.match(/[^.!?]+[.!?]?/g) || [];
  return matches
    .map((sentence) => cleanTakeawayText(sentence))
    .filter(Boolean)
    .slice(0, 4);
}

function extractTextBullets(text) {
  const takeaways = [];
  const lines = normalizeReportText(text).split(/\r?\n/);
  let current = "";

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      if (current) {
        takeaways.push(current);
        current = "";
      }
      continue;
    }
    if (/^Positive \(\+\) or Negative \(-\) Implications/i.test(line) || /^\((?:\+|-)\)/.test(line)) {
      continue;
    }
    if (TAKEAWAY_STOP_PATTERNS.some((pattern) => pattern.test(line))) {
      if (current) {
        takeaways.push(current);
        current = "";
      }
      continue;
    }
    if (/^[-*•]\s+/.test(line)) {
      if (current) {
        takeaways.push(current);
      }
      current = line.replace(/^[-*•]\s+/, "");
      continue;
    }
    if (current) {
      current += ` ${line}`;
    }
  }

  if (current) {
    takeaways.push(current);
  }

  return takeaways.map(cleanTakeawayText).filter(Boolean);
}

function uniqueTakeaways(values, limit = 6) {
  const seen = new Set();
  const unique = [];
  for (const value of values) {
    const cleaned = cleanTakeawayText(value);
    if (!cleaned) {
      continue;
    }
    const key = cleaned.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(cleaned);
    if (unique.length >= limit) {
      break;
    }
  }
  return unique;
}

function loadResultDigest(root, result) {
  const digest = {
    title: result.title,
    reference: renderResultReference(result),
    takeaways: [],
    summary: "",
    relativePath: result.relativePath
  };

  let frontmatter = result.frontmatter || {};
  let body = "";
  const notePath = path.join(root, result.relativePath);
  if (String(result.relativePath || "").toLowerCase().endsWith(".md") && fs.existsSync(notePath)) {
    const parsed = parseFrontmatter(readText(notePath));
    frontmatter = parsed.frontmatter;
    body = parsed.body;
  }

  const pageRouteBullets = extractMarkdownBullets(extractMarkdownSection(body, "Page Route"));
  const bodyBullets = extractMarkdownBullets(extractMarkdownSection(body, "What This Source Says"));
  const summarySentences = extractSentences(extractMarkdownSection(body, "Summary"));

  let extractedTextBullets = [];
  const extractedTextPath = String(frontmatter.extracted_text_path || "").trim();
  if (extractedTextPath) {
    const absoluteExtractedPath = path.join(root, extractedTextPath);
    if (fs.existsSync(absoluteExtractedPath)) {
      extractedTextBullets = extractTextBullets(readText(absoluteExtractedPath));
    }
  }

  const documentClass = String(frontmatter.document_class || "").trim().toLowerCase();
  const orderedTakeaways =
    documentClass === "chartpack_or_visual"
      ? [...bodyBullets, ...pageRouteBullets, ...summarySentences, ...extractedTextBullets]
      : [...extractedTextBullets, ...bodyBullets, ...pageRouteBullets, ...summarySentences];

  digest.takeaways = uniqueTakeaways(orderedTakeaways, 5);
  digest.summary = digest.takeaways[0] || cleanTakeawayText(result.excerpt) || truncate(result.title, 180);
  return digest;
}

function summarizeSectionDigests(root, section) {
  return section.results.map((result) => loadResultDigest(root, result));
}

function preferredTakeawaysFromDigests(digests, limit = 3) {
  const nonPageTakeaways = uniqueTakeaways(
    digests.flatMap((digest) => digest.takeaways.filter((takeaway) => !/^Page \d+/i.test(takeaway))),
    limit
  );
  if (nonPageTakeaways.length) {
    return nonPageTakeaways;
  }
  return uniqueTakeaways(digests.flatMap((digest) => digest.takeaways), limit);
}

function investmentSectionPriorityScore(section, result) {
  const title = String(result.title || "");
  const frontmatter = result.frontmatter || {};
  let score = Number(result.score || 0);
  const pattern = INVESTMENT_SECTION_PRIORITY_PATTERNS[section.key];

  if (pattern && pattern.test(title)) {
    score += 12;
  }
  if (String(result.relativePath || "").startsWith("wiki/source-notes/")) {
    score += 3;
  }
  if (String(frontmatter.document_class || "").trim().toLowerCase() === "chartpack_or_visual") {
    score += ["macro-regime", "fx-commodities-em"].includes(section.key) ? 2 : -10;
  }

  return score;
}

function buildSectionNarrative(root, section, index) {
  if (!section.results.length) {
    return `### ${index + 1}. ${section.heading}\n\nThe current corpus is still too thin to write a grounded section here.`;
  }

  const digests = summarizeSectionDigests(root, section);
  const leadTakeaways = preferredTakeawaysFromDigests(digests, 3);
  const leadParagraph = [
    "The dominant message in this part of the corpus is straightforward.",
    leadTakeaways[0] || "The evidence is still thinner than it should be.",
    leadTakeaways[1] || ""
  ]
    .filter(Boolean)
    .join(" ");

  const sourceParagraph = digests
    .slice(0, 3)
    .map((digest, sourceIndex) => {
      const takeaway =
        digest.takeaways.find((item) => !/^Page \d+/i.test(item)) ||
        digest.takeaways[sourceIndex + 1] ||
        digest.takeaways[0] ||
        digest.summary;
      return `- ${digest.reference}: ${takeaway}`;
    })
    .join("\n");

  return `### ${index + 1}. ${section.heading}\n\n${leadParagraph}\n\nKey supporting sources:\n${sourceParagraph}\n\n${
    INVESTMENT_SECTION_IMPLICATIONS[section.key] || "Portfolio read-through: keep the evidence set narrow, explicit, and source-grounded."
  }`;
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

function isReviewedSource(frontmatter = {}) {
  return ["text_reviewed", "visual_reviewed", "visual-and-text-reviewed", "operator_reviewed"].includes(
    normalizeReviewStatus(frontmatter)
  );
}

function isProvisionalResult(result) {
  if (!String(result.relativePath || "").startsWith("wiki/source-notes/")) {
    return false;
  }

  const frontmatter = result.frontmatter || {};
  const status = String(frontmatter.status || "").trim().toLowerCase();
  const reviewStatus = normalizeReviewStatus(frontmatter);
  const documentClass = String(frontmatter.document_class || "").trim().toLowerCase();
  if (documentClass === "chartpack_or_visual" && !hasVisualReview(frontmatter)) {
    return true;
  }
  return status === "draft" || !reviewStatus || reviewStatus === "unreviewed";
}

function reviewedSourceCount(results) {
  return results.filter(
    (result) => String(result.relativePath || "").startsWith("wiki/source-notes/") && isReviewedSource(result.frontmatter || {})
  ).length;
}

function uniqueByRelativePath(results) {
  const seen = new Set();
  return results.filter((result) => {
    const key = String(result.relativePath || "");
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function isBroadInvestmentSummaryTopic(topic) {
  const normalized = String(topic || "").trim().toLowerCase();
  return (
    normalized.includes("investment summary") ||
    normalized.includes("current investment summary") ||
    normalized.includes("all ingested research") ||
    normalized.includes("all corpus") ||
    normalized.includes("entire corpus") ||
    normalized.includes("whole corpus")
  );
}

function buildWatchContextBlock(watch) {
  if (!watch.profile) {
    return "";
  }

  const frontmatter = watch.profile.frontmatter;
  return `
## Watch Context

- Watch profile: [[${watch.profile.relativePath.replace(/^wiki\//, "").replace(/\.md$/i, "")}|${watch.profile.title}]]
- Priority: ${frontmatter.priority || "medium"}
- Cadence: ${frontmatter.cadence || "ad-hoc"}
- Why it matters: ${frontmatter.watch_context || "No watch context recorded yet."}
- Aliases: ${Array.isArray(frontmatter.aliases) && frontmatter.aliases.length ? frontmatter.aliases.join(", ") : "None"}
- Entities: ${Array.isArray(frontmatter.entities) && frontmatter.entities.length ? frontmatter.entities.join(", ") : "None"}
- Concepts: ${Array.isArray(frontmatter.concepts) && frontmatter.concepts.length ? frontmatter.concepts.join(", ") : "None"}
`;
}

function buildClaimContextBlock(claims, state) {
  return `
## Claim Ledger

- Current state label: ${state ? state.stateLabel : "not refreshed"}
- Current state page: ${state ? `[[${state.statePath.replace(/^wiki\//, "").replace(/\.md$/i, "")}|${state.subject}]]` : "none"}
- Claims surfaced: ${claims.length}

${claims.length ? claims.slice(0, 6).map((claim) => `- ${claim.claim_text}`).join("\n") : "- No relevant claims surfaced yet."}
`;
}

function buildDataGapSection(results, claims, retrieval) {
  const lines = [];
  if (results.length < 3) {
    lines.push("- Add more directly relevant evidence notes or source notes before treating this report as well-covered.");
  }
  if (claims.length < 3) {
    lines.push("- The claim ledger is still thin on this topic; refresh claims after ingesting more evidence.");
  }
  if (retrieval.escalated) {
    lines.push("- Retrieval had to escalate beyond the initial budget, which signals weak TL;DR coverage.");
  }

  const provisional = uniqueByRelativePath(results.filter(isProvisionalResult));
  if (provisional.length) {
    lines.push(
      `- ${provisional.length} provisional source note(s) still sit in the route: ${provisional
        .slice(0, 4)
        .map((result) => result.title)
        .join("; ")}.`
    );
  }

  return lines.length ? lines.join("\n") : "- No immediate data-gap pressure surfaced beyond normal corpus incompleteness risk.";
}

function buildReportBody(topic, results, watch, claims, state, retrieval) {
  if (!results.length) {
    return `
# ${topic}

## Executive Summary

The current local corpus does not yet support a grounded report on this topic.

## Context

- Topic: ${topic}
- Coverage: no relevant evidence found.

## Evidence

- None.

${renderRetrievalBudgetBlock(retrieval)}

${buildWatchContextBlock(watch)}

${buildClaimContextBlock(claims, state)}

## Synthesis

Add source material, rerun ingest and compile, and then regenerate the report.

## Counter-Case

- The repo may simply be incomplete rather than the topic being unsupported.

## Data Gaps

- Add directly relevant primary evidence and rerun claim/state refresh.

## Open Questions

- Which primary sources would most quickly improve coverage?
`;
  }

  const synthesis = synthesisParagraphs(topic, results, { mode: "report" });
  const route = results.slice(0, 4).map((result) => result.title).join("; ");
  const topCluster = results.slice(0, 5).map((result) => `- ${result.title}: ${result.excerpt}`).join("\n");

  return `
# ${topic}

## Executive Summary

${synthesis.summary}

## Context

- Topic: ${topic}
- Primary evidence route: ${route}
- Corpus confidence: ${confidenceLabel(results)}

## Evidence

${evidenceBullets(results, 280)}

${renderRetrievalBudgetBlock(retrieval)}

${buildWatchContextBlock(watch)}

${buildClaimContextBlock(claims, state)}

## Synthesis

${synthesis.summary}

Most directly:

${topCluster}

## Counter-Case

- The current repo may be over-representing one regime, one author cluster, or one style of evidence.
- Review unresolved extraction gaps and classification gaps before treating this report as settled.
- Treat the report as an internal working document, not as proof that the knowledge base is complete.

## Data Gaps

${buildDataGapSection(results, claims, retrieval)}

## Open Questions

- Which arguments are currently under-evidenced?
- Which opposing sources would most likely change the conclusion?
- What should be promoted into a dedicated thesis, concept, or surveillance page next?

## Source Map

${results.map((result) => `- ${renderResultReference(result)}`).join("\n")}
`;
}

function buildInvestmentSections(root, options = {}) {
  return INVESTMENT_SECTION_PLAN.map((section) => {
    const evidenceResults = searchCorpus(root, section.query, {
      limit: Math.max(section.limit, 6),
      excerptLength: 300,
      includePrefixes: INVESTMENT_EVIDENCE_PREFIXES,
      excludePrefixes: GROUNDED_EXCLUDE_PREFIXES
    });
    const canonicalResults =
      evidenceResults.length >= 3
        ? []
        : searchCorpus(root, section.query, {
            limit: 3,
            excerptLength: 300,
            includePrefixes: INVESTMENT_CANONICAL_PREFIXES,
            excludePrefixes: GROUNDED_EXCLUDE_PREFIXES
          });
    const rawResults = evidenceResults.length >= 3
      ? []
      : searchCorpus(root, section.query, {
          limit: 3,
          excerptLength: 300,
          includePrefixes: INVESTMENT_RAW_PREFIXES,
          excludePrefixes: GROUNDED_EXCLUDE_PREFIXES
        });
    const results = uniqueByRelativePath([...evidenceResults, ...canonicalResults, ...rawResults])
      .sort(
        (left, right) =>
          investmentSectionPriorityScore(section, right) - investmentSectionPriorityScore(section, left) ||
          left.relativePath.localeCompare(right.relativePath)
      )
      .slice(0, section.limit);
    const retrieval = {
      requestedBudget: section.budget,
      activeBudget: rawResults.length ? "L3" : "L2",
      escalated: rawResults.length > 0,
      results
    };
    return {
      ...section,
      retrieval,
      results,
      synthesis: results.length ? synthesisParagraphs(section.heading, results, { mode: "report" }) : null,
      reviewedCount: reviewedSourceCount(results),
      provisionalResults: uniqueByRelativePath(results.filter(isProvisionalResult))
    };
  });
}

function buildInvestmentExecutiveSummary(root, sections) {
  const coveredSections = sections.filter((section) => section.results.length);
  if (!coveredSections.length) {
    return "The current corpus does not yet support a grounded broad investment summary.";
  }

  const macroLead = coveredSections.find((section) => section.key === "macro-regime");
  const ratesLead = coveredSections.find((section) => section.key === "rates-duration");
  const equitiesLead = coveredSections.find((section) => section.key === "equities-ai");
  const creditLead = coveredSections.find((section) => section.key === "credit-liquidity");
  const macroTakeaway = macroLead ? preferredTakeawaysFromDigests(summarizeSectionDigests(root, macroLead), 1)[0] : "";
  const ratesTakeaway = ratesLead ? preferredTakeawaysFromDigests(summarizeSectionDigests(root, ratesLead), 1)[0] : "";
  const equitiesTakeaway = equitiesLead ? preferredTakeawaysFromDigests(summarizeSectionDigests(root, equitiesLead), 1)[0] : "";
  const creditTakeaway = creditLead ? preferredTakeawaysFromDigests(summarizeSectionDigests(root, creditLead), 1)[0] : "";

  const bullets = [
    macroTakeaway
      ? `- The regime still looks investable, but it is more inflation-sensitive and selective than a clean broad risk-on environment. ${macroTakeaway}`
      : "",
    ratesTakeaway ? `- Duration remains a live risk surface rather than an automatic hedge. ${ratesTakeaway}` : "",
    equitiesTakeaway
      ? `- Equity leadership still looks narrower and more quality-driven than the index headline suggests. ${equitiesTakeaway}`
      : "",
    creditTakeaway ? `- Credit opportunity remains real, but the underwriting bar is higher now. ${creditTakeaway}` : ""
  ].filter(Boolean);

  return `The corpus is strongest where macro, rates, equity leadership, sector rotation, and private-credit risk intersect. Read together, it points to selective risk rather than indiscriminate risk-on positioning.

My synthesis is:

${bullets.join("\n")}`;
}

function buildInvestmentCoverageBlock(sections) {
  const coveredSections = sections.filter((section) => section.results.length).length;
  const allResults = uniqueByRelativePath(sections.flatMap((section) => section.results));
  const reviewed = reviewedSourceCount(allResults);
  const provisional = uniqueByRelativePath(allResults.filter(isProvisionalResult));
  const escalations = sections.filter((section) => section.retrieval.escalated).length;

  return `
## Coverage Notes

- Sections covered: ${coveredSections}/${sections.length}
- Unique evidence surfaces used: ${allResults.length}
- Reviewed source notes in route: ${reviewed}
- Provisional source notes in route: ${provisional.length}
- Escalated retrieval sections: ${escalations}
`;
}

function buildInvestmentRetrievalBlock(sections) {
  return `
## Retrieval Discipline

- Discipline: TL;DR-first across curated investment lenses, escalating to raw extracts only when shorter routes were thin.
${sections
  .map(
    (section) =>
      `- ${section.heading}: requested ${section.retrieval.requestedBudget}, active ${section.retrieval.activeBudget}, escalated ${
        section.retrieval.escalated ? "yes" : "no"
      }.`
  )
  .join("\n")}
`;
}

function buildPortfolioSignposts(sections) {
  const available = new Set(sections.filter((section) => section.results.length).map((section) => section.key));
  const lines = [];

  if (available.has("macro-regime")) {
    lines.push("- Treat selective risk as the base case rather than broad risk-on beta.");
  }
  if (available.has("rates-duration")) {
    lines.push("- Keep duration tactical and be suspicious of complacent long-end comfort.");
  }
  if (available.has("equities-ai")) {
    lines.push("- Separate AI infrastructure and quality growth from indiscriminate equity exposure.");
  }
  if (available.has("sector-defensives")) {
    lines.push("- Respect health care and other quality defensives more than deep cyclical beta.");
  }
  if (available.has("credit-liquidity")) {
    lines.push("- Underwrite private credit carefully and distrust concentrated software or hyperscaler exposure.");
  }
  if (available.has("fx-commodities-em")) {
    lines.push("- Watch oil, the dollar, and EM flows together because that is where cross-asset pressure should reappear first.");
  }

  return lines.length ? lines.join("\n") : "- Add more investment evidence before drawing portfolio signposts.";
}

function buildCarefulWith(sections) {
  const available = new Set(sections.filter((section) => section.results.length).map((section) => section.key));
  const lines = [];

  if (available.has("rates-duration")) {
    lines.push("- long-dated sovereign duration as a default safe haven");
  }
  if (available.has("equities-ai")) {
    lines.push("- weak software, narrow mega-cap concentration, and easy-multiple thinking");
  }
  if (available.has("sector-defensives")) {
    lines.push("- deep cyclical beta that assumes the energy shock fades quickly");
  }
  if (available.has("credit-liquidity")) {
    lines.push("- concentrated private-credit books tied to software or hyperscaler risk");
  }
  if (available.has("fx-commodities-em")) {
    lines.push("- broad EM beta if dollar and oil pressure accelerate together");
  }

  return lines.length ? lines.join("\n") : "- broad unsupported portfolio conclusions";
}

function buildPriorityWatchList(sections) {
  const available = new Set(sections.filter((section) => section.results.length).map((section) => section.key));
  const lines = [];

  if (available.has("macro-regime")) {
    lines.push("- whether the energy shock fades or starts to embed into a second inflation wave");
  }
  if (available.has("rates-duration")) {
    lines.push("- whether bond supply and term-premia pressure keep duration from behaving as a hedge");
  }
  if (available.has("equities-ai")) {
    lines.push("- whether AI capex and leadership stay resilient enough to justify select tech exposure");
  }
  if (available.has("credit-liquidity")) {
    lines.push("- whether concentrated private-credit stress stays contained or starts to spread");
  }
  if (available.has("fx-commodities-em")) {
    lines.push("- whether dollar strength and EM outflows are stabilising or worsening");
  }

  return lines.length ? lines.join("\n") : "- which evidence surface should be refreshed next";
}

function buildInvestmentCounterCase(sections) {
  const lines = [
    "- The current corpus may still over-represent a de-escalation baseline or one research-house framing.",
    "- Cross-asset relationships can break if the geopolitical shock changes shape rather than simply fading.",
    "- Some of the strongest evidence surfaces are still research notes rather than first-party market data series."
  ];

  const provisional = uniqueByRelativePath(sections.flatMap((section) => section.provisionalResults));
  if (provisional.length) {
    lines.push(
      `- Provisional sources still present in the route: ${provisional
        .slice(0, 4)
        .map((result) => result.title)
        .join("; ")}.`
    );
  }

  return lines.join("\n");
}

function buildInvestmentDataGaps(sections, claims) {
  const lines = [];
  const uncovered = sections.filter((section) => !section.results.length);
  if (uncovered.length) {
    lines.push(`- Add stronger evidence for: ${uncovered.map((section) => section.heading).join("; ")}.`);
  }

  const thinSections = sections.filter((section) => section.results.length > 0 && section.results.length < 3);
  if (thinSections.length) {
    lines.push(`- Coverage is still thin in: ${thinSections.map((section) => section.heading).join("; ")}.`);
  }

  const provisional = uniqueByRelativePath(sections.flatMap((section) => section.provisionalResults));
  if (provisional.length) {
    lines.push(
      `- Review or replace provisional source notes still feeding the route: ${provisional
        .slice(0, 6)
        .map((result) => result.title)
        .join("; ")}.`
    );
  }

  if (claims.length < 3) {
    lines.push("- The claim ledger is still thin relative to the breadth of this report; refresh claims after ingesting more differentiated evidence.");
  }

  return lines.length ? lines.join("\n") : "- No immediate data gaps surfaced beyond normal corpus incompleteness risk.";
}

function buildInvestmentBottomLine(sections) {
  const available = new Set(sections.filter((section) => section.results.length).map((section) => section.key));
  const lines = [];

  lines.push("The corpus currently supports a stance of selective risk rather than broad risk-on positioning.");
  if (available.has("rates-duration")) {
    lines.push("Respect the inflation and duration problem; do not assume the long end has become easy again.");
  }
  if (available.has("equities-ai")) {
    lines.push("Treat AI as structurally alive but internally differentiated, with a higher bar for weak software and narrow multiple expansion.");
  }
  if (available.has("credit-liquidity")) {
    lines.push("Treat private credit as an opportunity set that now requires real skepticism about concentration and underwriting quality.");
  }

  return lines.join(" ");
}

function buildInvestmentSummaryBody(root, topic, sections, claims) {
  const allResults = uniqueByRelativePath(sections.flatMap((section) => section.results));
  return `
# ${topic}

## Executive Summary

${buildInvestmentExecutiveSummary(root, sections)}

## What The Corpus Says

${sections
  .filter((section) => section.results.length)
  .map((section, index) => buildSectionNarrative(root, section, index))
  .join("\n\n")}

## Investment Implications

## Judgement

This is the broad portfolio stance implied by the current corpus.

### Prefer

${buildPortfolioSignposts(sections)}

### Be Careful With

${buildCarefulWith(sections)}

### What Looks Most Important Right Now

${buildPriorityWatchList(sections)}

## Counter-Case

${buildInvestmentCounterCase(sections)}

## Data Gaps

${buildInvestmentDataGaps(sections, claims)}

## Open Questions

- Which cross-asset views still depend too heavily on one sell-side house or one scenario path?
- Which opposing sources would most likely change the duration, AI, or private-credit conclusions?
- Which sections should be promoted into dedicated theses, states, or watch profiles next?

## Bottom Line

${buildInvestmentBottomLine(sections)}

${buildInvestmentCoverageBlock(sections)}

${buildInvestmentRetrievalBlock(sections)}

## Source Map

${allResults.length ? allResults.map((result) => `- ${renderResultReference(result)}`).join("\n") : "- No grounded sources surfaced."}
`;
}

function reportSlug(topic) {
  return slugify(topic).slice(0, 80) || "report";
}

function canonicalReportPath(topic) {
  return `wiki/reports/${reportSlug(topic)}.md`;
}

function canonicalReportArchiveDir(topic) {
  return `wiki/reports/archive/${reportSlug(topic)}`;
}

function summarizeClaimsForPack(claims) {
  return claims.map((claim) => ({
    id: claim.id,
    claim_text: claim.claim_text,
    status: claim.status,
    claim_type: claim.claim_type,
    confidence: claim.confidence,
    origin_note_path: claim.origin_note_path,
    origin_title: claim.origin_title,
    concepts: claim.concepts,
    entities: claim.entities
  }));
}

function summarizeEvidenceForPack(root, results) {
  return results.map((result) => {
    const digest = loadResultDigest(root, result);
    return {
      title: digest.title,
      relative_path: result.relativePath,
      reference: digest.reference,
      summary: digest.summary,
      takeaways: digest.takeaways
    };
  });
}

function summarizeWatchForPack(watch) {
  if (!watch.profile) {
    return {
      title: "",
      query: watch.query || "",
      context: "",
      aliases: [],
      entities: [],
      concepts: [],
      triggers: [],
      path: ""
    };
  }
  const frontmatter = watch.profile.frontmatter || {};
  const normalizeList = (value) => {
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
  };
  return {
    title: watch.profile.title,
    query: watch.query || "",
    context: frontmatter.context || frontmatter.watch_context || "",
    aliases: normalizeList(frontmatter.aliases),
    entities: normalizeList(frontmatter.entities),
    concepts: normalizeList(frontmatter.concepts),
    triggers: normalizeList(frontmatter.risk_triggers),
    path: watch.profile.relativePath
  };
}

function extractProbabilitySummary(root, relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    return null;
  }
  const parsed = parseFrontmatter(readText(absolutePath));
  return {
    title: parsed.frontmatter.title || path.basename(relativePath, ".md"),
    relative_path: relativePath,
    profile_id: parsed.frontmatter.profile_id || "",
    as_of_date: parsed.frontmatter.as_of_date || "",
    confidence: parsed.frontmatter.confidence || "",
    current_regime: extractMarkdownBullets(extractMarkdownSection(parsed.body, "Managed Current Regime")).slice(0, 3),
    scenario_archetypes: extractMarkdownBullets(extractMarkdownSection(parsed.body, "Managed Scenario Archetypes")).slice(0, 3),
    transmission: extractMarkdownBullets(extractMarkdownSection(parsed.body, "Managed Transmission Map")).slice(0, 3),
    data_gaps: extractMarkdownBullets(extractMarkdownSection(parsed.body, "Managed Data Gaps")).slice(0, 3)
  };
}

function investmentProbabilityPages(root) {
  const directory = path.join(root, "wiki", "probabilities");
  if (!fs.existsSync(directory)) {
    return [];
  }

  const preferred = ["global-risk-regime.md", "north-asia-ai-hardware.md"];
  const available = fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".md") && entry.name.toLowerCase() !== "index.md")
    .map((entry) => entry.name);
  const ordered = [
    ...preferred.filter((name) => available.includes(name)),
    ...available.filter((name) => !preferred.includes(name)).sort((left, right) => left.localeCompare(right))
  ];

  return ordered
    .map((fileName) => extractProbabilitySummary(root, path.join("wiki", "probabilities", fileName).replace(/\\/g, "/")))
    .filter(Boolean);
}

function buildReportTemplate(topic, route) {
  if (route === "broad_investment_summary") {
    return `# ${topic}

## Executive Summary

Replace this placeholder with the model-authored executive summary.

## Intermarket Relationship Map

Show the transmission chain and relationship structure.
Make explicit:
- what moved first
- what confirmed
- what diverged
- whether divergence is noise, transition, or warning
- how commodities, rates, FX, credit, and equity leadership interact

## Forward Probability Surface

### Current Regime And Distribution

### 5d / 21d / 63d / 126d Read-Through

### Most Likely Paths And Dangerous Plausible Paths

## What The Corpus Says

### 1. Macro / Regime

### 2. Rates / Duration

### 3. Equities / AI

### 4. Sector / Defensive Rotation

### 5. Credit / Liquidity

### 6. FX / Commodities / EM

## Investment Implications

## Judgement

### Prefer

### Be Careful With

### What Looks Most Important Right Now

## Counter-Case

## Data Gaps

## Bottom Line

## Source Map
`;
  }

  return `# ${topic}

## Executive Summary

Replace this placeholder with the model-authored report.

## Context

## What The Corpus Says

## Judgement

## Counter-Case

## Data Gaps

## Open Questions

## Source Map
`;
}

function investmentClaims(root, options = {}) {
  return searchClaims(root, "global macro rates duration equities ai private credit energy oil dollar emerging markets", {
    limit: Number(options.claimLimit || 24),
    statuses: ["active", "contested", "stale"]
  })
    .filter((claim) => {
      const text = String(claim.claim_text || "").trim().toLowerCase();
      return (
        text &&
        !/direct capture created|page-by-page|initial batch capture authored|review notes? from capture|text was extracted locally|pdfplumber|direct single-document capture used|review chart-heavy sections/i.test(
          text
        )
      );
    })
    .slice(0, Number(options.claimLimit || 12));
}

function buildInvestmentReportPack(root, topic, options = {}) {
  const claims = investmentClaims(root, options);
  const sections = buildInvestmentSections(root, options);
  const probabilities = investmentProbabilityPages(root);
  const results = uniqueByRelativePath(sections.flatMap((section) => section.results));
  const localSources = uniqueLocalSources([
    ...results.map((result) => makeLocalSource(result.relativePath, result.title, "evidence")),
    ...probabilities.map((page) => makeLocalSource(page.relative_path, page.title, "probability-surface")),
    ...claims.map((claim) =>
      makeLocalSource(`wiki/claims/${String(claim.id || "").toLowerCase()}.md`, truncate(claim.claim_text, 96), "claim")
    )
  ]);

  return {
    route: "broad_investment_summary",
    results,
    localSources,
    pack: {
      generated_at: nowIso(),
      mode: "report",
      route: "broad_investment_summary",
      topic,
      title: topic,
      canonical_report_path: canonicalReportPath(topic),
      canonical_archive_dir: canonicalReportArchiveDir(topic),
      report_policy: "Final report must be authored by the active terminal model. Cato provides memory, retrieval, and structure only.",
      claims: summarizeClaimsForPack(claims),
      probabilities,
      coverage: {
        section_count: sections.length,
        unique_evidence_surfaces: results.length,
        reviewed_source_count: reviewedSourceCount(results),
        provisional_source_count: uniqueByRelativePath(results.filter(isProvisionalResult)).length
      },
      sections: sections.map((section) => ({
        key: section.key,
        heading: section.heading,
        retrieval: section.retrieval,
        reviewed_source_count: section.reviewedCount,
        provisional_source_count: section.provisionalResults.length,
        implication_anchor:
          INVESTMENT_SECTION_IMPLICATIONS[section.key] || "Keep the section grounded and portfolio-relevant.",
        source_digests: summarizeSectionDigests(root, section).map((digest) => ({
          title: digest.title,
          relative_path: digest.relativePath,
          reference: digest.reference,
          summary: digest.summary,
          takeaways: digest.takeaways
        }))
      })),
      local_sources: localSources
    }
  };
}

function buildGenericReportPack(root, topic, options = {}) {
  const watch = resolveWatchSubject(root, topic);
  const claims = searchClaims(root, watch.query, {
    limit: Number(options.claimLimit || 8),
    statuses: ["active", "contested", "stale"]
  });
  const state = refreshState(root, topic, {
    claimLimit: options.claimLimit,
    evidenceLimit: options.evidenceLimit
  });
  const retrieval = retrieveEvidence(root, watch.query, {
    budget: options.budget || "L2",
    mode: "report",
    limit: Number(options.limit || 10),
    excerptLength: 300,
    excludePrefixes: GROUNDED_EXCLUDE_PREFIXES
  });
  const results = retrieval.results;
  const localSources = uniqueLocalSources([
    makeLocalSource(watch.profile?.relativePath, watch.profile?.title, "watch-profile"),
    makeLocalSource(state.statePath, state.subject, "state-page"),
    ...claims.map((claim) =>
      makeLocalSource(`wiki/claims/${String(claim.id || "").toLowerCase()}.md`, truncate(claim.claim_text, 96), "claim")
    ),
    ...results.map((result) => makeLocalSource(result.relativePath, result.title, "evidence"))
  ]);

  return {
    route: "generic_grounded_report",
    results,
    localSources,
    pack: {
      generated_at: nowIso(),
      mode: "report",
      route: "generic_grounded_report",
      topic,
      title: topic,
      canonical_report_path: canonicalReportPath(topic),
      canonical_archive_dir: canonicalReportArchiveDir(topic),
      report_policy: "Final report must be authored by the active terminal model. Cato provides memory, retrieval, and structure only.",
      watch: summarizeWatchForPack(watch),
      state: {
        subject: state.subject,
        state_path: state.statePath,
        state_label: state.stateLabel,
        confidence: state.confidence
      },
      retrieval: {
        requested_budget: retrieval.requestedBudget,
        active_budget: retrieval.activeBudget,
        escalated: retrieval.escalated,
        results: summarizeEvidenceForPack(root, results)
      },
      claims: summarizeClaimsForPack(claims),
      local_sources: localSources
    }
  };
}

function buildReportPromptMarkdown(pack, capturePath) {
  const localLines = summarizeLocalSources(pack.local_sources || [], 24);
  const claimLines = (pack.claims || [])
    .slice(0, 8)
    .map((claim) => `- ${claim.claim_text} (${claim.status}, ${claim.confidence})`)
    .join("\n");
  const probabilityLines = (pack.probabilities || [])
    .map((page) => {
      const current = page.current_regime?.length ? page.current_regime.join(" ") : "No current-regime summary extracted.";
      const archetypes = page.scenario_archetypes?.length ? page.scenario_archetypes.join(" ") : "No archetype summary extracted.";
      const transmission = page.transmission?.length ? page.transmission.join(" ") : "No transmission summary extracted.";
      const gaps = page.data_gaps?.length ? page.data_gaps.join(" ") : "No explicit data-gap note.";
      return `## ${page.title}

- Path: \`${page.relative_path}\`
- Profile: ${page.profile_id || "n/a"}
- As of date: ${page.as_of_date || "n/a"}
- Confidence: ${page.confidence || "n/a"}
- Current regime: ${current}
- Archetypes: ${archetypes}
- Transmission: ${transmission}
- Data gaps: ${gaps}`;
    })
    .join("\n\n");

  let routeBlock = "";
  if (pack.route === "broad_investment_summary") {
    routeBlock = (pack.sections || [])
      .map((section) => {
        const digestLines = (section.source_digests || [])
          .slice(0, 3)
          .map((digest) => `- ${digest.title}: ${(digest.takeaways || []).slice(0, 2).join(" ") || digest.summary}`)
          .join("\n");
        return `## ${section.heading}

- Retrieval: requested ${section.retrieval.requestedBudget}, active ${section.retrieval.activeBudget}, escalated ${
          section.retrieval.escalated ? "yes" : "no"
        }
- Implication anchor: ${section.implication_anchor}
${digestLines || "- No grounded source digest yet."}`;
      })
      .join("\n\n");
  } else {
    const evidenceLines = (pack.retrieval?.results || [])
      .slice(0, 6)
      .map((digest) => `- ${digest.title}: ${(digest.takeaways || []).slice(0, 2).join(" ") || digest.summary}`)
      .join("\n");
    routeBlock = `## Retrieval Route

- Requested budget: ${pack.retrieval?.requested_budget || "L2"}
- Active budget: ${pack.retrieval?.active_budget || "L2"}
- Escalated: ${pack.retrieval?.escalated ? "yes" : "no"}
- State page: \`${pack.state?.state_path || ""}\`
- Watch profile: \`${pack.watch?.path || ""}\`

## Evidence Highlights

${evidenceLines || "- No grounded evidence surfaced yet."}`;
  }

  return `# Report Pack Prompt

Cato is the memory and grounding layer. The final report must be authored by the active terminal model, not by deterministic Cato prose.

## Objective

- Topic: ${pack.topic}
- Route: ${pack.route}
- Canonical report path: \`${pack.canonical_report_path}\`
- Capture bundle: \`${capturePath}\`

## Required Operating Rules

1. Read the pack JSON at \`${pack.pack_path}\`.
2. Review the local sources listed below before writing the final report.
3. Treat the pack as structured scaffolding, not as the final authored text.
4. Write the final markdown into \`output.body\` in the capture bundle.
5. Fill \`model\` with the actual Codex/Claude session label used for authorship.
6. Keep \`local_sources\` intact, and add live URLs under \`sources\` only if you actually did fresh web research.
7. Finalise the report with:
   \`.\cato.cmd capture-report "${capturePath}"\`

## Local Context Sources

${localLines || "- None."}

${pack.self_model ? `${renderSelfModelMarkdownBlock(pack.self_model)}\n` : ""}

## Claim Context

${claimLines || "- No claim context surfaced."}

${pack.probabilities?.length ? `## Probability Surfaces\n\n${probabilityLines}\n` : ""}

${routeBlock}

${pack.route === "broad_investment_summary"
  ? `## Intermarket Discipline

- Do not write the report as six isolated buckets.
- Weave the relationships between commodities, rates, FX, credit, liquidity, and equity leadership into one regime narrative.
- Make explicit: what moved first, what confirmed, what diverged, what changed at the margin, and what the transmission chain implies for portfolio leadership and risk.
- Use the probability surfaces as forward-looking distribution context, not as replacements for grounded evidence.
- Separate current setup, current price expression, and current risk-reward from the quality of the underlying macro or fundamental story.
`
  : ""}
`;
}

function writeReport(root, topic, options = {}) {
  const normalizedTopic = String(topic || "").trim();
  if (!normalizedTopic) {
    throw new Error("writeReport requires a topic.");
  }

  const packData = isBroadInvestmentSummaryTopic(normalizedTopic)
    ? buildInvestmentReportPack(root, normalizedTopic, options)
    : buildGenericReportPack(root, normalizedTopic, options);
  const context = resolvePackContext(root, {
    command: "report",
    topic: normalizedTopic,
    baseSources: packData.pack.local_sources || []
  });
  const selfModel = context.selfModel;
  const packSlug = reportSlug(normalizedTopic);
  const localSources = context.localSources;
  const paths = writePackArtifacts(root, {
    cacheDir: path.join("cache", "report-packs"),
    slugSeed: packSlug,
    pack(paths) {
      return {
        ...packData.pack,
        self_model: serializeSelfModelContext(selfModel),
        local_sources: localSources,
        pack_path: paths.packPath
      };
    },
    captureBundle(paths) {
      const pack = {
        ...packData.pack,
        self_model: serializeSelfModelContext(selfModel),
        local_sources: localSources,
        pack_path: paths.packPath
      };
      const captureBundle = {
        mode: "report",
        route: pack.route,
        topic: pack.topic,
        question: options.question || "",
        pack_path: paths.packPath,
        authoring_layer: "terminal_model",
        model: "",
        authoring_session: "",
        local_sources: localSources,
        sources: [],
        output: {
          kind: "final-report",
          title: pack.title,
          canonical_path: pack.canonical_report_path,
          archive_dir: pack.canonical_archive_dir,
          promote: false,
          generation_mode: "terminal_model_report",
          frontmatter: {
            report_topic: pack.topic,
            report_route: pack.route,
            canonical_report: true,
            report_status: "final",
            evidence_source_count: packData.results.length,
            claim_count: (pack.claims || []).length
          },
          body: buildReportTemplate(pack.title, pack.route)
        }
      };
      if (pack.watch?.title) {
        captureBundle.watch_topic = pack.watch.title;
        captureBundle.watch = {
          subject: pack.watch.title,
          context: pack.watch.context,
          aliases: pack.watch.aliases,
          entities: pack.watch.entities,
          concepts: pack.watch.concepts,
          triggers: pack.watch.triggers
        };
      }
      return captureBundle;
    },
    promptMarkdown(paths) {
      const pack = {
        ...packData.pack,
        self_model: serializeSelfModelContext(selfModel),
        local_sources: localSources,
        pack_path: paths.packPath
      };
      return buildReportPromptMarkdown(pack, paths.capturePath);
    },
    logFile: path.join("logs", "actions", "report_runs.jsonl"),
    logEntry(paths) {
      return {
        event: "report_pack",
        topic: packData.pack.topic,
        route: packData.pack.route,
        pack_path: paths.packPath,
        prompt_path: paths.promptPath,
        capture_path: paths.capturePath,
        canonical_report_path: packData.pack.canonical_report_path,
        evidence_results: packData.results.length,
        local_sources: localSources.length
      };
    }
  });

  return {
    topic: packData.pack.topic,
    route: packData.pack.route,
    packPath: paths.packPath,
    promptPath: paths.promptPath,
    capturePath: paths.capturePath,
    canonicalPath: packData.pack.canonical_report_path,
    results: packData.results,
    localSources: localSources.length
  };
}

function captureReport(root, bundleInput, options = {}) {
  return captureTerminalModelBundle(root, bundleInput, {
    label: "Report capture",
    generationMode: "terminal_model_report",
    placeholderChecks: [
      {
        test: (body) => /Replace this placeholder with the model-authored/i.test(body),
        message: "Report capture bundle still contains the placeholder body. Replace it with the real model-authored report first."
      }
    ],
    captureOptions: options,
    logFile: path.join("logs", "actions", "report_runs.jsonl"),
    logEvent: "report_capture",
    logFields(bundle) {
      return {
        topic: bundle.topic || "",
        route: bundle.route || ""
      };
    }
  });
}

function archiveLegacyReportRuns(root) {
  const reportsDir = path.join(root, "outputs", "reports");
  if (!fs.existsSync(reportsDir)) {
    return {
      archived: 0,
      archiveDir: "outputs/reports/archive/legacy-deterministic"
    };
  }

  const files = fs
    .readdirSync(reportsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".md"))
    .map((entry) => entry.name);
  if (!files.length) {
    return {
      archived: 0,
      archiveDir: "outputs/reports/archive/legacy-deterministic"
    };
  }

  const archiveDir = path.join(reportsDir, "archive", "legacy-deterministic");
  const archivedPaths = [];
  for (const fileName of files) {
    const sourcePath = path.join(reportsDir, fileName);
    const targetPath = uniquePath(path.join(archiveDir, fileName));
    moveFile(sourcePath, targetPath);
    archivedPaths.push(relativeToRoot(root, targetPath));
  }

  appendJsonl(path.join(root, "logs", "actions", "report_runs.jsonl"), {
    event: "report_archive_legacy_outputs",
    at: nowIso(),
    archive_dir: relativeToRoot(root, archiveDir),
    archived_paths: archivedPaths
  });

  return {
    archived: archivedPaths.length,
    archiveDir: relativeToRoot(root, archiveDir),
    archivedPaths
  };
}

module.exports = {
  archiveLegacyReportRuns,
  captureReport,
  writeReport
};
