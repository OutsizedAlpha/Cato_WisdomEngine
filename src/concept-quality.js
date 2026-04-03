const { STOPWORDS } = require("./constants");

const MONTHS = new Set([
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december"
]);

const GENERIC_SINGLE_WORD_TOKENS = new Set([
  "am",
  "actual",
  "annual",
  "april",
  "aug",
  "august",
  "auction",
  "auctions",
  "billion",
  "bill",
  "bills",
  "bond",
  "bonds",
  "browser",
  "calendar",
  "change",
  "changes",
  "commodities",
  "consensus",
  "countries",
  "country",
  "crypto",
  "currencies",
  "currency",
  "data",
  "december",
  "download",
  "earnings",
  "estimate",
  "estimates",
  "expected",
  "february",
  "feature",
  "features",
  "forecast",
  "nbsp",
  "historical",
  "index",
  "indexes",
  "indicator",
  "indicators",
  "january",
  "july",
  "june",
  "latest",
  "march",
  "market",
  "markets",
  "may",
  "members",
  "million",
  "monthly",
  "mom",
  "news",
  "november",
  "october",
  "past",
  "pm",
  "plan",
  "plans",
  "point",
  "points",
  "previous",
  "prior",
  "print",
  "prints",
  "quarter",
  "quarterly",
  "rank",
  "release",
  "released",
  "releases",
  "report",
  "reports",
  "search",
  "september",
  "shares",
  "source",
  "subscription",
  "today",
  "trillion",
  "utc",
  "update",
  "updates",
  "week",
  "weekly",
  "year",
  "years",
  "yoy"
]);

const DISALLOWED_PHRASE_TOKENS = new Set([
  "actual",
  "annual",
  "april",
  "aug",
  "august",
  "billion",
  "bill",
  "bills",
  "calendar",
  "change",
  "changes",
  "consensus",
  "data",
  "december",
  "estimate",
  "estimates",
  "expected",
  "february",
  "forecast",
  "index",
  "indexes",
  "indicator",
  "indicators",
  "january",
  "july",
  "june",
  "latest",
  "march",
  "million",
  "month",
  "months",
  "monthly",
  "mom",
  "nbsp",
  "november",
  "october",
  "past",
  "pm",
  "point",
  "points",
  "previous",
  "prior",
  "print",
  "prints",
  "quarter",
  "quarterly",
  "release",
  "released",
  "releases",
  "report",
  "reports",
  "september",
  "source",
  "today",
  "trillion",
  "utc",
  "update",
  "updates",
  "week",
  "weekly",
  "year",
  "years",
  "yoy"
]);

const ABBREVIATION_TOKENS = new Set([
  "am",
  "apr",
  "aug",
  "cn",
  "dec",
  "eia",
  "eu",
  "feb",
  "jan",
  "jp",
  "jul",
  "jun",
  "kr",
  "mar",
  "mba",
  "mom",
  "nbsp",
  "nov",
  "oct",
  "pm",
  "qoq",
  "sep",
  "uk",
  "us",
  "utc",
  "yoy",
  "ytd"
]);

const SINGLE_WORD_ALLOWLIST = new Set([
  "ai",
  "capex",
  "cpi",
  "credit",
  "demand",
  "exports",
  "flows",
  "freight",
  "funding",
  "gdp",
  "growth",
  "housing",
  "imports",
  "inflation",
  "inventory",
  "labour",
  "labor",
  "liquidity",
  "manufacturing",
  "pce",
  "pmi",
  "ppi",
  "production",
  "rates",
  "services",
  "shipping",
  "skew",
  "trade",
  "volatility"
]);

function normalizeConceptLabel(value) {
  return String(value || "")
    .toLowerCase()
    .match(/[a-z0-9]+/g)?.join(" ")
    .trim() || "";
}

function conceptWords(value) {
  return normalizeConceptLabel(value).split(" ").filter(Boolean);
}

function buildConceptOntologyIndex(ontology = {}) {
  const terms = [];
  for (const domainTerms of Object.values(ontology.domains || {})) {
    for (const term of Array.isArray(domainTerms) ? domainTerms : []) {
      const normalized = normalizeConceptLabel(term);
      if (normalized) {
        terms.push(normalized);
      }
    }
  }

  const uniqueTerms = [...new Set(terms)];
  return {
    terms: uniqueTerms,
    termSet: new Set(uniqueTerms),
    singleWordTerms: new Set(uniqueTerms.filter((term) => term.split(" ").length === 1))
  };
}

function isGenericToken(token) {
  return !token || STOPWORDS.has(token) || MONTHS.has(token) || GENERIC_SINGLE_WORD_TOKENS.has(token) || /^\d+$/.test(token);
}

function isMeaningfulConcept(value, options = {}) {
  const ontologyIndex = options.ontologyIndex || buildConceptOntologyIndex();
  const allowSingleWordFallback = options.allowSingleWordFallback !== false;
  const normalized = normalizeConceptLabel(value);
  if (!normalized) {
    return false;
  }

  const words = conceptWords(normalized);
  if (!words.length) {
    return false;
  }

  if (ontologyIndex.termSet.has(normalized)) {
    return true;
  }

  if (words.some((word) => DISALLOWED_PHRASE_TOKENS.has(word))) {
    return false;
  }

  if (words.length === 1) {
    const [word] = words;
    if (isGenericToken(word)) {
      return false;
    }
    return ontologyIndex.singleWordTerms.has(word) || SINGLE_WORD_ALLOWLIST.has(word) || (allowSingleWordFallback && word.length >= 5);
  }

  if (words.length > 4) {
    return false;
  }

  if (words.some((word) => MONTHS.has(word))) {
    return false;
  }

  if (words.length > 1 && words.some((word) => ABBREVIATION_TOKENS.has(word))) {
    return false;
  }

  const abbreviationLikeWords = words.filter((word) => ABBREVIATION_TOKENS.has(word) || word.length <= 3).length;
  if (abbreviationLikeWords > words.length / 2) {
    return false;
  }

  if (words.every((word) => isGenericToken(word))) {
    return false;
  }

  return true;
}

function isMeaningfulCandidateConcept(value, ontologyIndex = buildConceptOntologyIndex()) {
  return isMeaningfulConcept(value, {
    ontologyIndex,
    allowSingleWordFallback: false
  });
}

function isMeaningfulExplicitConcept(value, ontologyIndex = buildConceptOntologyIndex()) {
  return isMeaningfulConcept(value, {
    ontologyIndex,
    allowSingleWordFallback: true
  });
}

function normalizeSourceText(value) {
  return normalizeConceptLabel(value);
}

function contentTokens(value) {
  return conceptWords(value).filter((word) => !STOPWORDS.has(word) && !MONTHS.has(word) && !/^\d+$/.test(word));
}

function collectContiguousPhraseCounts(value, size) {
  const normalizedText = normalizeSourceText(value);
  const paddedText = ` ${normalizedText} `;
  const tokens = contentTokens(value);
  const counts = new Map();

  for (let index = 0; index <= tokens.length - size; index += 1) {
    const phrase = tokens.slice(index, index + size).join(" ");
    if (!phrase || !paddedText.includes(` ${phrase} `)) {
      continue;
    }
    counts.set(phrase, (counts.get(phrase) || 0) + 1);
  }

  return counts;
}

function collectSingleWordCounts(value) {
  const counts = new Map();
  for (const token of contentTokens(value)) {
    counts.set(token, (counts.get(token) || 0) + 1);
  }
  return counts;
}

function addCandidateScore(scores, label, score, ontologyIndex, titleText) {
  const normalized = normalizeConceptLabel(label);
  if (!isMeaningfulCandidateConcept(normalized, ontologyIndex)) {
    return;
  }

  let weightedScore = score;
  if (ontologyIndex.termSet.has(normalized)) {
    weightedScore += 12;
  }
  if (titleText.includes(` ${normalized} `)) {
    weightedScore += 4;
  }

  scores.set(normalized, (scores.get(normalized) || 0) + weightedScore);
}

function extractCandidateConcepts(title, extractedText, ontology = {}) {
  const ontologyIndex = buildConceptOntologyIndex(ontology);
  const combined = `${title || ""}\n${extractedText || ""}`;
  const paddedCombined = ` ${normalizeSourceText(combined)} `;
  const paddedTitle = ` ${normalizeSourceText(title)} `;
  const scores = new Map();

  for (const term of ontologyIndex.terms) {
    if (paddedCombined.includes(` ${term} `)) {
      addCandidateScore(scores, term, 14, ontologyIndex, paddedTitle);
    }
  }

  for (const size of [2, 3]) {
    for (const [phrase, count] of collectContiguousPhraseCounts(title, size)) {
      addCandidateScore(scores, phrase, count * 8, ontologyIndex, paddedTitle);
    }
  }

  for (const size of [2, 3]) {
    for (const [phrase, count] of collectContiguousPhraseCounts(combined, size)) {
      if (count >= 2 || paddedTitle.includes(` ${phrase} `)) {
        addCandidateScore(scores, phrase, count * 4, ontologyIndex, paddedTitle);
      }
    }
  }

  for (const [token, count] of collectSingleWordCounts(combined)) {
    if (count >= 3 || paddedTitle.includes(` ${token} `)) {
      addCandidateScore(scores, token, count, ontologyIndex, paddedTitle);
    }
  }

  return [...scores.entries()]
    .sort(
      (left, right) =>
        right[1] - left[1] ||
        right[0].split(" ").length - left[0].split(" ").length ||
        left[0].localeCompare(right[0])
    )
    .slice(0, 8)
    .map(([label]) => label);
}

module.exports = {
  buildConceptOntologyIndex,
  extractCandidateConcepts,
  isMeaningfulExplicitConcept,
  isMeaningfulCandidateConcept,
  normalizeConceptLabel
};
