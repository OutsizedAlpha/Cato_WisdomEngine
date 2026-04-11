const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { parseFrontmatter, toWikiLink } = require("./markdown");
const { ensureProjectStructure } = require("./project");
const { updateManagedNote, writeOutputByFamily } = require("./research");
const { refreshState } = require("./states");
const { resolveWatchSubject } = require("./watch");
const {
  appendJsonl,
  ensureDir,
  nowIso,
  readJson,
  readJsonl,
  readText,
  relativeToRoot,
  slugify,
  truncate,
  writeJson
} = require("./utils");
const {
  loadSeriesHistory,
  loadScenarioProfiles,
  marketSeriesManifestRelativePath,
  refreshMarketData,
  resolveScenarioProfile,
  resolveSeriesDefinitions
} = require("./market-data");

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

function parseHorizons(value, fallback = [5, 21, 63, 126]) {
  const values = normalizeList(value)
    .map((entry) => Number(entry))
    .filter((entry) => Number.isFinite(entry) && entry > 0)
    .map((entry) => Math.round(entry));
  return values.length ? [...new Set(values)].sort((left, right) => left - right) : fallback;
}

function confidenceWeight(label) {
  switch (String(label || "").trim().toLowerCase()) {
    case "high":
      return 1.25;
    case "medium-high":
      return 1.1;
    case "low":
      return 0.65;
    default:
      return 0.85;
  }
}

function modelConfidence(diagnostics = {}) {
  const historyDays = Number(diagnostics.history_days || 0);
  const missingPenalty = Array.isArray(diagnostics.missing_series) ? diagnostics.missing_series.length : 0;
  if (historyDays >= 756 && missingPenalty === 0) {
    return "high";
  }
  if (historyDays >= 504) {
    return "medium-high";
  }
  if (historyDays >= 252) {
    return "medium";
  }
  return "low";
}

function formatPct(value, digits = 1) {
  if (!Number.isFinite(Number(value))) {
    return "n/a";
  }
  return `${(Number(value) * 100).toFixed(digits)}%`;
}

function formatBp(value) {
  if (!Number.isFinite(Number(value))) {
    return "n/a";
  }
  return `${Number(value).toFixed(1)} bp/day`;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function loadScenarioSnapshotHistory(root, profileId) {
  return readJsonl(path.join(root, "manifests", "scenario_history.jsonl"), [])
    .filter((entry) => String(entry.profile_id || "") === String(profileId || ""))
    .sort((left, right) => String(left.at || "").localeCompare(String(right.at || "")));
}

function runPythonScenarioEngine(root, inputPayload, options = {}) {
  const slug = slugify(`${inputPayload.profile.id}-${inputPayload.topic || "scenario"}`).slice(0, 80) || "scenario";
  const inputPath = path.join(root, "cache", "scenario-runs", `${slug}-input.json`);
  const outputPath = path.join(root, "cache", "scenario-runs", `${slug}-output.json`);
  ensureDir(path.dirname(inputPath));
  writeJson(inputPath, inputPayload);

  const scriptPath = path.join(__dirname, "..", "tools", "run_probability_engine.py");
  const invocations =
    process.platform === "win32"
      ? [{ command: "python", args: [scriptPath, "--input", inputPath, "--output", outputPath] }]
      : [
          { command: "python3", args: [scriptPath, "--input", inputPath, "--output", outputPath] },
          { command: "python", args: [scriptPath, "--input", inputPath, "--output", outputPath] }
        ];

  let lastError = null;
  for (const invocation of invocations) {
    const result = spawnSync(invocation.command, invocation.args, {
      cwd: root,
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 64 * 1024 * 1024
    });
    if (result.status === 0) {
      return {
        result: readJson(outputPath, {}),
        inputPath: relativeToRoot(root, inputPath),
        outputPath: relativeToRoot(root, outputPath),
        runner: invocation.command
      };
    }
    lastError = (result.stderr || result.stdout || `${invocation.command} failed.`).trim();
  }

  throw new Error(lastError || "Probability engine failed.");
}

function buildStateOverlay(root, profile, options = {}) {
  const subjects = normalizeList(options.subjects).length ? normalizeList(options.subjects) : profile.subjects || [];
  const overlay = {
    subjects: [],
    seriesBiasBpsPerDay: {},
    explanations: []
  };

  for (const subject of subjects) {
    const state = refreshState(root, subject, {
      claimLimit: options["claim-limit"] || 12,
      evidenceLimit: options["evidence-limit"] || 8
    });
    const positiveClaims = state.claims.filter((claim) => claim.polarity === "positive" && claim.status !== "contested").length;
    const negativeClaims = state.claims.filter((claim) => claim.polarity === "negative" || claim.status === "contested").length;
    const balance = positiveClaims - negativeClaims;
    const intensity = Math.max(0.5, Math.min(1.75, confidenceWeight(state.confidence) + Math.abs(balance) * 0.12));
    const subjectOverlay =
      profile.state_overlays?.[subject]?.[state.stateLabel] ||
      profile.state_overlays?.[subject]?.mixed ||
      {};

    for (const [seriesId, bps] of Object.entries(subjectOverlay)) {
      overlay.seriesBiasBpsPerDay[seriesId] = Number(overlay.seriesBiasBpsPerDay[seriesId] || 0) + Number(bps || 0) * intensity;
    }

    const summary = {
      subject,
      state_label: state.stateLabel,
      confidence: state.confidence,
      net_claim_balance: balance,
      intensity: Number(intensity.toFixed(3)),
      state_path: state.statePath
    };
    overlay.subjects.push(summary);

    const biasEntries = Object.entries(subjectOverlay)
      .slice(0, 6)
      .map(([seriesId, bps]) => `${seriesId} ${formatBp(Number(bps || 0) * intensity)}`);
    overlay.explanations.push(
      `${subject}: ${state.stateLabel} (${state.confidence}) with net claim balance ${balance >= 0 ? "+" : ""}${balance}. Overlay -> ${
        biasEntries.length ? biasEntries.join(", ") : "no direct series tilt."
      }`
    );
  }

  return overlay;
}

function loadScenarioSeries(root, seriesDefinitions) {
  const loaded = [];
  const missingSeries = [];
  for (const definition of seriesDefinitions) {
    const history = loadSeriesHistory(root, definition.id);
    if (!history?.observations?.length) {
      missingSeries.push(definition.id);
      continue;
    }
    loaded.push({
      id: definition.id,
      title: definition.title,
      kind: definition.kind || "price",
      transform: definition.transform || "log_return",
      simulate: definition.simulate !== false,
      groups: definition.groups || [],
      source_url: history.source_url || "",
      raw_path: history.raw_path || "",
      manifest_path: marketSeriesManifestRelativePath(definition.id),
      values: history.observations
    });
  }

  if (loaded.length < 4) {
    throw new Error(
      `Scenario engine requires at least 4 cached market series. Missing: ${missingSeries.join(", ") || "none"}, loaded: ${loaded.length}.`
    );
  }

  return {
    series: loaded,
    missingSeries
  };
}

function probabilityPagePath(profile) {
  return path.join("wiki", "probabilities", `${slugify(profile.id || profile.title || "probability").slice(0, 80) || "probability"}.md`).replace(/\\/g, "/");
}

function probabilityTitle(profile) {
  return `${profile.title} Probability Surface`;
}

function renderPosteriorLines(model) {
  return asArray(model.regimes)
    .sort((left, right) => Number(right.probability_now || 0) - Number(left.probability_now || 0))
    .map(
      (regime) =>
        `- ${regime.label}: ${formatPct(regime.probability_now)} now, median duration ${Number(regime.median_duration_days || 0).toFixed(
          0
        )}d, current run ${Number(regime.current_run_days || 0).toFixed(0)}d.`
    )
    .join("\n");
}

function renderOverlayBlock(overlay) {
  const lines = [];
  if (overlay.explanations.length) {
    lines.push(...overlay.explanations.map((line) => `- ${line}`));
  }
  const topBiases = Object.entries(overlay.seriesBiasBpsPerDay)
    .sort((left, right) => Math.abs(Number(right[1] || 0)) - Math.abs(Number(left[1] || 0)))
    .slice(0, 10);
  if (topBiases.length) {
    lines.push("- Top series tilts:");
    lines.push(...topBiases.map(([seriesId, bps]) => `  ${seriesId}: ${formatBp(bps)}`));
  }
  return lines.length ? lines.join("\n") : "- No corpus-driven overlay was applied.";
}

function renderHorizonTable(model, horizon, seriesIds) {
  const bucket = model.horizons?.[String(horizon)] || {};
  const rows = asArray(seriesIds)
    .map((seriesId) => ({
      seriesId,
      stats: bucket.series?.[seriesId]
    }))
    .filter((entry) => entry.stats);
  if (!rows.length) {
    return "| Series | Mean | Median | Prob Up | P10 | P90 |\n| --- | ---: | ---: | ---: | ---: | ---: |\n| n/a | n/a | n/a | n/a | n/a | n/a |";
  }
  const lines = ["| Series | Mean | Median | Prob Up | P10 | P90 |", "| --- | ---: | ---: | ---: | ---: | ---: |"];
  for (const row of rows) {
    lines.push(
      `| ${row.seriesId} | ${formatPct(row.stats.mean_return_pct / 100)} | ${formatPct(row.stats.median_return_pct / 100)} | ${formatPct(
        row.stats.prob_up
      )} | ${formatPct(row.stats.p10_return_pct / 100)} | ${formatPct(row.stats.p90_return_pct / 100)} |`
    );
  }
  return lines.join("\n");
}

function renderCompositeTable(model, horizon) {
  const composites = model.horizons?.[String(horizon)]?.composites || {};
  const entries = Object.entries(composites);
  if (!entries.length) {
    return "| Composite | Mean | Median | Prob Up |\n| --- | ---: | ---: | ---: |\n| n/a | n/a | n/a | n/a |";
  }
  const lines = ["| Composite | Mean | Median | Prob Up |", "| --- | ---: | ---: | ---: |"];
  for (const [compositeId, stats] of entries) {
    lines.push(
      `| ${compositeId} | ${formatPct(stats.mean_return_pct / 100)} | ${formatPct(stats.median_return_pct / 100)} | ${formatPct(
        stats.prob_up
      )} |`
    );
  }
  return lines.join("\n");
}

function renderRegimeProbabilities(model, horizon) {
  const probabilities = model.horizons?.[String(horizon)]?.regime_probabilities || {};
  const entries = Object.entries(probabilities).sort((left, right) => Number(right[1] || 0) - Number(left[1] || 0));
  if (!entries.length) {
    return "- No regime probabilities available.";
  }
  return entries.map(([label, probability]) => `- ${label}: ${formatPct(probability)}`).join("\n");
}

function renderArchetypes(model) {
  const entries = asArray(model.archetypes);
  if (!entries.length) {
    return "- No scenario archetypes were generated.";
  }
  return entries
    .map(
      (entry, index) =>
        `${index + 1}. ${entry.label} (${formatPct(entry.probability)}). End regime: ${entry.end_regime}. Key composite outcomes: ${Object.entries(
          entry.composite_median_returns || {}
        )
          .map(([key, value]) => `${key} ${formatPct(value / 100)}`)
          .join(", ")}.`
    )
    .join("\n");
}

function renderTransmission(model) {
  const lines = [];
  for (const factor of asArray(model.transmission)) {
    const positives = asArray(factor.positive_loadings)
      .map((entry) => `${entry.series} ${Number(entry.loading || 0).toFixed(2)}`)
      .join(", ");
    const negatives = asArray(factor.negative_loadings)
      .map((entry) => `${entry.series} ${Number(entry.loading || 0).toFixed(2)}`)
      .join(", ");
    lines.push(
      `- ${factor.label}: explains ${formatPct(factor.explained_variance)} of standardized variance. Positive loadings: ${positives || "n/a"}. Negative loadings: ${
        negatives || "n/a"
      }.`
    );
  }
  return lines.length ? lines.join("\n") : "- No transmission factors were surfaced.";
}

function renderDataGaps(model, seriesDefinitions, overlay) {
  const lines = [];
  if (asArray(model.diagnostics?.missing_series).length) {
    lines.push(`- Missing series in this run: ${model.diagnostics.missing_series.join(", ")}.`);
  }
  if (Number(model.diagnostics?.history_days || 0) < 252) {
    lines.push("- History depth is below 252 synchronized daily observations; treat short-horizon probabilities cautiously.");
  }
  if (!overlay.subjects.length) {
    lines.push("- No state subjects were linked into the corpus overlay.");
  }
  const featureOnly = seriesDefinitions.filter((series) => series.simulate === false).map((series) => series.id);
  if (featureOnly.length) {
    lines.push(`- Feature-only macro series are used for regime inference and transmission context, not as directly simulated tradable outputs: ${featureOnly.join(", ")}.`);
  }
  return lines.length ? lines.join("\n") : "- No immediate structural data gaps surfaced beyond ordinary market-data refresh discipline.";
}

function buildScenarioSnapshot(profile, topic, probabilityPath, model, overlay) {
  return {
    event: "scenario_refresh",
    at: nowIso(),
    topic,
    profile_id: profile.id,
    title: probabilityTitle(profile),
    probability_path: probabilityPath,
    as_of_date: model.as_of_date || "",
    current_regime: model.current_regime?.label || "",
    current_regime_probability: Number(model.current_regime?.probability || 0),
    horizons: model.horizons || {},
    archetypes: asArray(model.archetypes).slice(0, 10),
    diagnostics: model.diagnostics || {},
    overlay: {
      subjects: overlay.subjects,
      series_bias_bps_per_day: overlay.seriesBiasBpsPerDay
    }
  };
}

function writeProbabilityPage(root, profile, topic, model, overlay, seriesDefinitions, options = {}) {
  const probabilityPath = probabilityPagePath(profile);
  const watch = resolveWatchSubject(root, topic || profile.title);
  const sources = [
    ...(watch.profile ? [watch.profile.relativePath] : []),
    ...overlay.subjects.map((entry) => entry.state_path),
    ...seriesDefinitions.map((series) => marketSeriesManifestRelativePath(series.id))
  ].filter(Boolean);
  const frontmatter = {
    id: `PROB-${slugify(profile.id || profile.title || "scenario").slice(0, 12).toUpperCase()}`,
    kind: "probability-page",
    title: probabilityTitle(profile),
    status: "active",
    confidence: modelConfidence(model.diagnostics),
    profile_id: profile.id,
    topic: topic || profile.title,
    as_of_date: model.as_of_date || "",
    simulation_paths: Number(model.paths || 0),
    horizons: model.horizons_requested || [],
    source_count: sources.length,
    sources
  };

  const anchorSeries = profile.anchor_series?.length ? profile.anchor_series : seriesDefinitions.filter((series) => series.simulate !== false).map((series) => series.id).slice(0, 10);
  const longestHorizon = Math.max(...(model.horizons_requested || [63]));

  updateManagedNote(path.join(root, probabilityPath), frontmatter, probabilityTitle(profile), {
    model: `
## Managed Model Configuration

- Topic: ${topic || profile.title}
- Profile: ${profile.id}
- As of date: ${model.as_of_date || "n/a"}
- Simulation paths: ${Number(model.paths || 0).toLocaleString()}
- Horizons: ${(model.horizons_requested || []).join(", ")} trading days
- History depth: ${Number(model.diagnostics?.history_days || 0).toFixed(0)} synchronized daily observations
- Regimes selected: ${Number(model.diagnostics?.selected_regime_count || 0).toFixed(0)}
- Latent transmission factors: ${Number(model.diagnostics?.factor_count || 0).toFixed(0)}
- Python runner: ${options.runner || "python"}
`,
    current: `
## Managed Current Regime

- Active regime: ${model.current_regime?.label || "n/a"} (${formatPct(model.current_regime?.probability || 0)})
- Current run length: ${Number(model.current_regime?.current_run_days || 0).toFixed(0)} days

${renderPosteriorLines(model)}
`,
    overlay: `
## Managed Corpus Overlay

${renderOverlayBlock(overlay)}
`,
    five: `
## Managed 5 Day Distribution

${renderHorizonTable(model, 5, anchorSeries)}

### Managed 5 Day Regime Probabilities

${renderRegimeProbabilities(model, 5)}
`,
    twentyone: `
## Managed 21 Day Distribution

${renderHorizonTable(model, 21, anchorSeries)}

### Managed 21 Day Composite Map

${renderCompositeTable(model, 21)}
`,
    sixtythree: `
## Managed 63 Day Distribution

${renderHorizonTable(model, 63, anchorSeries)}

### Managed 63 Day Composite Map

${renderCompositeTable(model, 63)}
`,
    one26: `
## Managed 126 Day Distribution

${renderHorizonTable(model, 126, anchorSeries)}

### Managed 126 Day Regime Probabilities

${renderRegimeProbabilities(model, 126)}
`,
    scenarios: `
## Managed Scenario Archetypes (${longestHorizon} Day Horizon)

${renderArchetypes(model)}
`,
    transmission: `
## Managed Transmission Map

${renderTransmission(model)}
`,
    gaps: `
## Managed Data Gaps

${renderDataGaps(model, seriesDefinitions, overlay)}
`
  });

  return {
    probabilityPath,
    sources,
    watchProfilePath: watch.profile?.relativePath || ""
  };
}

function refreshScenario(root, topic, options = {}) {
  ensureProjectStructure(root);
  const { profile, defaults } = resolveScenarioProfile(root, topic, options);
  if (!options["no-market-refresh"]) {
    refreshMarketData(root, {
      ...options,
      topic,
      profile: profile.id
    });
  }

  const seriesDefinitions = resolveSeriesDefinitions(root, profile, options);
  const seriesLoad = loadScenarioSeries(root, seriesDefinitions);
  const overlay = buildStateOverlay(root, profile, options);
  const inputPayload = {
    topic: topic || profile.title,
    generated_at: nowIso(),
    profile,
    paths: Number(options.paths || defaults.paths || 100000),
    seed: Number(options.seed || 42),
    horizons: parseHorizons(options.horizons, defaults.horizons || [5, 21, 63, 126]),
    overlay,
    series: seriesLoad.series
  };

  const engine = runPythonScenarioEngine(root, inputPayload, options);
  if (seriesLoad.missingSeries.length) {
    engine.result.diagnostics = engine.result.diagnostics || {};
    engine.result.diagnostics.missing_series = [...new Set([...(engine.result.diagnostics.missing_series || []), ...seriesLoad.missingSeries])];
  }
  const page = writeProbabilityPage(root, profile, topic || profile.title, engine.result, overlay, seriesDefinitions, {
    runner: engine.runner
  });
  const snapshot = buildScenarioSnapshot(profile, topic || profile.title, page.probabilityPath, engine.result, overlay);
  appendJsonl(path.join(root, "manifests", "scenario_history.jsonl"), snapshot);
  appendJsonl(path.join(root, "logs", "actions", "scenario_runs.jsonl"), {
    event: "scenario_refresh",
    at: snapshot.at,
    topic: snapshot.topic,
    profile_id: profile.id,
    probability_path: page.probabilityPath,
    input_path: engine.inputPath,
    output_path: engine.outputPath
  });

  return {
    profile,
    probabilityPath: page.probabilityPath,
    watchProfilePath: page.watchProfilePath,
    sources: page.sources,
    overlay,
    model: engine.result,
    inputPath: engine.inputPath,
    outputPath: engine.outputPath
  };
}

function writeScenarioDiff(root, topic, options = {}) {
  ensureProjectStructure(root);
  const { profile } = resolveScenarioProfile(root, topic, options);
  const history = loadScenarioSnapshotHistory(root, profile.id);
  if (history.length < 2) {
    return {
      outputPath: "",
      changed: 0
    };
  }

  const previous = history[history.length - 2];
  const current = history[history.length - 1];
  const focusHorizon = String(Math.max(...Object.keys(current.horizons || {}).map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0), 63));
  const currentSeries = current.horizons?.[focusHorizon]?.series || {};
  const previousSeries = previous.horizons?.[focusHorizon]?.series || {};
  const watchedSeries = profile.anchor_series?.length ? profile.anchor_series.slice(0, 6) : Object.keys(currentSeries).slice(0, 6);

  const lines = [
    `# ${profile.title} Scenario Diff`,
    "",
    `## Snapshot Change`,
    "",
    `- Previous run: ${previous.at}`,
    `- Current run: ${current.at}`,
    `- As-of date: ${previous.as_of_date || "n/a"} -> ${current.as_of_date || "n/a"}`,
    `- Current regime: ${previous.current_regime || "n/a"} -> ${current.current_regime || "n/a"}`,
    "",
    `## ${focusHorizon} Day Anchor Changes`,
    ""
  ];

  let changed = 0;
  for (const seriesId of watchedSeries) {
    const before = previousSeries?.[seriesId];
    const after = currentSeries?.[seriesId];
    if (!before || !after) {
      continue;
    }
    const meanDelta = Number(after.mean_return_pct || 0) - Number(before.mean_return_pct || 0);
    const probDelta = Number(after.prob_up || 0) - Number(before.prob_up || 0);
    if (Math.abs(meanDelta) < 0.01 && Math.abs(probDelta) < 0.005) {
      continue;
    }
    changed += 1;
    lines.push(
      `- ${seriesId}: mean ${before.mean_return_pct.toFixed(2)}% -> ${after.mean_return_pct.toFixed(2)}% (${meanDelta >= 0 ? "+" : ""}${meanDelta.toFixed(
        2
      )} pts), prob up ${formatPct(before.prob_up)} -> ${formatPct(after.prob_up)} (${probDelta >= 0 ? "+" : ""}${(probDelta * 100).toFixed(1)} pts).`
    );
  }

  if (!changed) {
    lines.push("- No material anchor-series probability change surfaced between the last two runs.");
  }

  lines.push("", "## Regime Probability Shift", "");
  const previousRegimes = previous.horizons?.[focusHorizon]?.regime_probabilities || {};
  const currentRegimes = current.horizons?.[focusHorizon]?.regime_probabilities || {};
  const regimeNames = [...new Set([...Object.keys(previousRegimes), ...Object.keys(currentRegimes)])];
  for (const regime of regimeNames) {
    const before = Number(previousRegimes[regime] || 0);
    const after = Number(currentRegimes[regime] || 0);
    lines.push(`- ${regime}: ${formatPct(before)} -> ${formatPct(after)}.`);
  }

  const output = writeOutputByFamily(root, "brief", {
    title: `${profile.title} scenario diff`,
    fileSlug: `${profile.id}-scenario-diff`,
    sources: [current.probability_path, previous.probability_path].filter(Boolean),
    frontmatter: {
      topic: topic || profile.title,
      profile_id: profile.id,
      focus_horizon: Number(focusHorizon)
    },
    body: `${lines.join("\n").trim()}\n`
  });

  return {
    outputPath: output.outputPath,
    changed
  };
}

function writeProbabilityBrief(root, topic, options = {}) {
  const result = refreshScenario(root, topic, options);
  const profile = result.profile;
  const title = `${profile.title} probability brief`;
  const output = writeOutputByFamily(root, "probability-brief", {
    title,
    fileSlug: `${profile.id}-probability-brief`,
    sources: result.sources,
    frontmatter: {
      topic: topic || profile.title,
      profile_id: profile.id,
      as_of_date: result.model.as_of_date || "",
      simulation_paths: result.model.paths || 0
    },
    body: `
# ${title}

## Executive Summary

${profile.title} currently maps to the regime \`${result.model.current_regime?.label || "n/a"}\` with model probability ${formatPct(
      result.model.current_regime?.probability || 0
    )}. Use this brief to turn the probability surface into a tradable, falsifiable market read.

## Current Probability Surface

- Canonical probability page: ${toWikiLink(result.probabilityPath, probabilityTitle(profile))}
- As-of date: ${result.model.as_of_date || "n/a"}
- Paths simulated: ${Number(result.model.paths || 0).toLocaleString()}

## What Matters Most

- 5d and 21d outputs should drive tactical read-through and timing.
- 63d is the main path horizon for thesis expression.
- 126d is context only; do not overfit position timing to the longest horizon.

## Core Questions

- Which regime is dominant now, and what would force a transition?
- Which anchor series have the highest upside or downside asymmetry?
- Which scenario archetypes matter most for implementation and hedging?
- What is the most likely path, and what is the most dangerous plausible path?

## Probabilistic Read-Through

- Replace this scaffold with a model-authored interpretation that ties the simulated paths back to corpus evidence, price/setup discipline, and intermarket transmission.

## Falsifiers And Tripwires

- Specify the fastest indicators that would invalidate the current probability surface.
- Separate regime invalidation from ordinary noise.
`
  });

  const localSources = [
    {
      path: result.probabilityPath,
      title: probabilityTitle(profile),
      role: "probability-surface"
    },
    ...result.sources.map((sourcePath) => ({
      path: sourcePath,
      title: path.basename(sourcePath, path.extname(sourcePath)),
      role: sourcePath.startsWith("wiki/states/") ? "state-page" : sourcePath.startsWith("wiki/watch-profiles/") ? "watch-profile" : "market-series"
    }))
  ];

  return {
    profile,
    outputPath: output.outputPath,
    probabilityPath: result.probabilityPath,
    localSources
  };
}

module.exports = {
  refreshScenario,
  writeProbabilityBrief,
  writeScenarioDiff
};
