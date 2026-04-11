Object.assign(global, require("../test-helpers"));

function businessDates(count) {
  const dates = [];
  const cursor = new Date(Date.UTC(2024, 0, 2));
  while (dates.length < count) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) {
      dates.push(cursor.toISOString().slice(0, 10));
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function round(value, digits = 4) {
  return Number(Number(value).toFixed(digits));
}

function buildSeriesValues(mode = "base") {
  const dates = businessDates(420);
  const series = {
    SPY: [],
    QQQ: [],
    TLT: [],
    HYG: [],
    UUP: [],
    USO: [],
    SMH: [],
    EWJ: [],
    EWY: [],
    EWT: [],
    DGS10: [],
    T10YIE: []
  };

  let spy = 100;
  let qqq = 100;
  let tlt = 100;
  let hyg = 100;
  let uup = 100;
  let uso = 100;
  let smh = 100;
  let ewj = 100;
  let ewy = 100;
  let ewt = 100;
  let dgs10 = 4.1;
  let t10yie = 2.25;

  for (let index = 0; index < dates.length; index += 1) {
    const cyclicalWave = 0.00018 * Math.sin(index / 7) + 0.00009 * Math.cos(index / 17);
    const hardwareWave = 0.00022 * Math.sin(index / 9);
    const regimePhase = index < 140 ? 1 : index < 280 ? -1 : 1;
    const lateShock = mode === "shock" && index >= 350 ? -1 : 0;
    const energyStress = (index >= 140 && index < 280 ? 1 : 0) + (lateShock ? 1 : 0);
    const hardwareLeadership = (index < 140 ? 1 : 0.2) + (index >= 280 ? 1.2 : 0) - (lateShock ? 1.4 : 0);
    const riskTone = 0.00055 * regimePhase - 0.0009 * lateShock + cyclicalWave;
    const energyTone = 0.0012 * energyStress + 0.00015 * Math.sin(index / 5);
    const ratesTone = 0.0032 * energyStress - 0.0021 * regimePhase + 0.0012 * lateShock + 0.0004 * Math.cos(index / 13);
    const inflationTone = 0.0022 * energyStress - 0.0012 * regimePhase + 0.0005 * lateShock + 0.00025 * Math.sin(index / 11);
    const hardwareTone = 0.001 * hardwareLeadership + hardwareWave;

    const spyReturn = riskTone - 0.18 * energyTone + 0.0001 * Math.sin(index / 3);
    const qqqReturn = riskTone + 0.65 * hardwareTone - 0.12 * energyTone;
    const tltReturn = -0.9 * ratesTone + 0.00015 * Math.cos(index / 8);
    const hygReturn = 0.75 * riskTone - 0.2 * energyTone + 0.00008 * Math.sin(index / 4);
    const uupReturn = 0.25 * energyTone - 0.22 * riskTone + 0.00005 * Math.cos(index / 6);
    const usoReturn = energyTone + 0.00022 * Math.sin(index / 4);
    const smhReturn = 0.55 * riskTone + 1.15 * hardwareTone - 0.15 * energyTone;
    const ewjReturn = 0.48 * riskTone + 0.5 * hardwareTone - 0.06 * energyTone + 0.00004 * Math.cos(index / 6);
    const ewyReturn = 0.52 * riskTone + 0.72 * hardwareTone - 0.07 * energyTone + 0.00005 * Math.sin(index / 8);
    const ewtReturn = 0.58 * riskTone + 0.95 * hardwareTone - 0.05 * energyTone + 0.00006 * Math.cos(index / 10);

    spy *= 1 + spyReturn;
    qqq *= 1 + qqqReturn;
    tlt *= 1 + tltReturn;
    hyg *= 1 + hygReturn;
    uup *= 1 + uupReturn;
    uso *= 1 + usoReturn;
    smh *= 1 + smhReturn;
    ewj *= 1 + ewjReturn;
    ewy *= 1 + ewyReturn;
    ewt *= 1 + ewtReturn;
    dgs10 += ratesTone;
    t10yie += inflationTone;

    series.SPY.push({ date: dates[index], value: round(spy) });
    series.QQQ.push({ date: dates[index], value: round(qqq) });
    series.TLT.push({ date: dates[index], value: round(tlt) });
    series.HYG.push({ date: dates[index], value: round(hyg) });
    series.UUP.push({ date: dates[index], value: round(uup) });
    series.USO.push({ date: dates[index], value: round(uso) });
    series.SMH.push({ date: dates[index], value: round(smh) });
    series.EWJ.push({ date: dates[index], value: round(ewj) });
    series.EWY.push({ date: dates[index], value: round(ewy) });
    series.EWT.push({ date: dates[index], value: round(ewt) });
    series.DGS10.push({ date: dates[index], value: round(dgs10) });
    series.T10YIE.push({ date: dates[index], value: round(t10yie) });
  }

  return series;
}

function stooqCsv(observations) {
  const lines = ["Date,Open,High,Low,Close,Volume"];
  for (const observation of observations) {
    const close = Number(observation.value);
    lines.push(
      `${observation.date},${round(close * 0.995)},${round(close * 1.005)},${round(close * 0.992)},${round(close)},1000000`
    );
  }
  return `${lines.join("\n")}\n`;
}

function fredCsv(observations) {
  const lines = ["DATE,VALUE"];
  for (const observation of observations) {
    lines.push(`${observation.date},${round(observation.value)}`);
  }
  return `${lines.join("\n")}\n`;
}

function buildFetcher(mode = "base") {
  const values = buildSeriesValues(mode);
  return (definition, url) => ({
    content: definition.vendor === "fred" ? fredCsv(values[definition.id]) : stooqCsv(values[definition.id]),
    final_url: url
  });
}

function buildStooqFallbackFetcher(mode = "base") {
  const values = buildSeriesValues(mode);
  return (definition, url) => {
    if (definition.vendor === "stooq") {
      return {
        content: "Get your apikey:\n1. Open https://stooq.com/q/d/?s=spy.us&get_apikey\n",
        final_url: url
      };
    }
    if (definition.vendor === "yahoo-chart") {
      return {
        content: JSON.stringify({
          chart: {
            result: [
              {
                timestamp: values[definition.id].map((entry) => Math.floor(new Date(`${entry.date}T00:00:00Z`).getTime() / 1000)),
                indicators: {
                  adjclose: [{ adjclose: values[definition.id].map((entry) => entry.value) }],
                  quote: [{ close: values[definition.id].map((entry) => entry.value) }]
                }
              }
            ]
          }
        }),
        final_url: url
      };
    }
    return {
      content: fredCsv(values[definition.id]),
      final_url: url
    };
  };
}

function buildFeatureFailureFetcher(mode = "base") {
  const values = buildSeriesValues(mode);
  return (definition, url) => {
    if (definition.id === "DGS10" || definition.id === "T10YIE") {
      throw new Error(`Timed out fetching ${definition.id}`);
    }
    return {
      content: definition.vendor === "fred" ? fredCsv(values[definition.id]) : stooqCsv(values[definition.id]),
      final_url: url
    };
  };
}

function writeScenarioConfigs(root) {
  fs.writeFileSync(
    path.join(root, "config", "market_series.json"),
    `${JSON.stringify(
      {
        version: 1,
        series: [
          { id: "SPY", title: "SPDR S&P 500 ETF", vendor: "stooq", symbol: "spy.us", kind: "equity", transform: "log_return", simulate: true, groups: ["risk", "us"] },
          { id: "QQQ", title: "Invesco QQQ", vendor: "stooq", symbol: "qqq.us", kind: "equity", transform: "log_return", simulate: true, groups: ["risk", "technology"] },
          { id: "TLT", title: "iShares 20+ Year Treasury Bond ETF", vendor: "stooq", symbol: "tlt.us", kind: "rates", transform: "log_return", simulate: true, groups: ["defense", "duration"] },
          { id: "HYG", title: "iShares iBoxx High Yield Corporate Bond ETF", vendor: "stooq", symbol: "hyg.us", kind: "credit", transform: "log_return", simulate: true, groups: ["risk", "credit"] },
          { id: "UUP", title: "Invesco DB US Dollar Index Bullish Fund", vendor: "stooq", symbol: "uup.us", kind: "fx", transform: "log_return", simulate: true, groups: ["dollar"] },
          { id: "USO", title: "United States Oil Fund", vendor: "stooq", symbol: "uso.us", kind: "commodity", transform: "log_return", simulate: true, groups: ["energy"] },
          { id: "SMH", title: "VanEck Semiconductor ETF", vendor: "stooq", symbol: "smh.us", kind: "equity", transform: "log_return", simulate: true, groups: ["hardware"] },
          { id: "EWJ", title: "iShares MSCI Japan ETF", vendor: "stooq", symbol: "ewj.us", kind: "equity", transform: "log_return", simulate: true, groups: ["north-asia"] },
          { id: "EWY", title: "iShares MSCI South Korea ETF", vendor: "stooq", symbol: "ewy.us", kind: "equity", transform: "log_return", simulate: true, groups: ["north-asia"] },
          { id: "EWT", title: "iShares MSCI Taiwan ETF", vendor: "stooq", symbol: "ewt.us", kind: "equity", transform: "log_return", simulate: true, groups: ["north-asia", "hardware"] },
          { id: "DGS10", title: "10-Year Treasury Yield", vendor: "fred", symbol: "DGS10", kind: "macro", transform: "diff", simulate: false, groups: ["rates"] },
          { id: "T10YIE", title: "10-Year Breakeven Inflation", vendor: "fred", symbol: "T10YIE", kind: "macro", transform: "diff", simulate: false, groups: ["inflation"] }
        ]
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  fs.writeFileSync(
    path.join(root, "config", "scenario_profiles.json"),
    `${JSON.stringify(
      {
        version: 1,
        default_paths: 4000,
        default_horizons: [5, 21, 63, 126],
        profiles: [
          {
            id: "test-probability-engine",
            title: "Test Probability Engine",
            subjects: ["AI Hardware"],
            series: ["SPY", "QQQ", "TLT", "HYG", "UUP", "USO", "SMH", "EWJ", "EWY", "EWT", "DGS10", "T10YIE"],
            anchor_series: ["SPY", "TLT", "USO", "SMH", "EWJ", "EWY", "EWT"],
            composites: {
              risk: { members: ["SPY", "QQQ", "HYG"] },
              defense: { members: ["TLT"] },
              hardware: { members: ["SMH", "EWT"] },
              north_asia: { members: ["EWJ", "EWY", "EWT"] },
              energy: { members: ["USO"] }
            },
            regime_count: { min: 2, max: 4 },
            archetype_count: 6,
            state_overlays: {
              "AI Hardware": {
                constructive: { SMH: 5, EWT: 5, EWJ: 2, EWY: 3 },
                fragile: { SMH: -5, EWT: -5, EWJ: -2, EWY: -3 },
                mixed: { SMH: 1, EWT: 1 }
              }
            }
          }
        ]
      },
      null,
      2
    )}\n`,
    "utf8"
  );
}

function seedScenarioContext(root) {
  writeSourceNoteFixture(
    root,
    "ai-hardware.md",
    {
      id: "SRC-SCENARIO-01",
      kind: "source-note",
      title: "North Asia AI hardware note",
      source_type: "paper",
      document_class: "research_note",
      capture_source: "manual_drop",
      ingested_at: "2026-04-11T10:00:00.000Z",
      raw_path: "raw/pdfs/ai-hardware.pdf",
      metadata_path: "extracted/metadata/ai-hardware.json",
      status: "reviewed",
      review_status: "text_reviewed",
      review_method: "manual review",
      review_scope: "Full note review.",
      tags: ["ai", "hardware"],
      entities: ["Taiwan", "Japan", "South Korea"],
      concepts: ["ai hardware", "north asia"]
    },
    `# North Asia AI hardware note

## Summary

North Asia hardware leadership remains the cleanest way to express AI capex strength.

## What This Source Says

- AI hardware demand remains strongest through Taiwanese foundries, Korean memory, and Japanese equipment.
- Intermarket confirmation matters because price, rates, oil, and regional equity leadership do not move independently.
`
  );
}

runTest("market refresh writes cached series histories and a market catalog", () => {
  const root = makeTempRepo();
  try {
    initProject(root);
    writeScenarioConfigs(root);
    seedScenarioContext(root);

    const result = refreshMarketData(root, {
      profile: "test-probability-engine",
      fetcher: buildFetcher("base")
    });

    assert.equal(result.profileId, "test-probability-engine");
    assert.equal(result.refreshed, 12);
    assert.ok(fs.existsSync(path.join(root, "manifests", "market_data_catalog.json")));
    assert.ok(fs.existsSync(path.join(root, "manifests", "market-data", "series", "spy.json")));
    assert.ok(fs.existsSync(path.join(root, "raw", "market-data", "spy.csv")));

    const catalog = JSON.parse(fs.readFileSync(path.join(root, "manifests", "market_data_catalog.json"), "utf8"));
    assert.equal(catalog.series.length, 12);
    const spy = JSON.parse(fs.readFileSync(path.join(root, "manifests", "market-data", "series", "spy.json"), "utf8"));
    assert.equal(spy.observation_count, 420);
    assert.equal(spy.first_date, "2024-01-02");
    assert.ok(spy.last_date >= "2025-08-01");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

runTest("market refresh falls back to yahoo chart data when stooq csv access is blocked", () => {
  const root = makeTempRepo();
  try {
    initProject(root);
    writeScenarioConfigs(root);

    const result = refreshMarketData(root, {
      profile: "test-probability-engine",
      fetcher: buildStooqFallbackFetcher("base")
    });

    assert.equal(result.refreshed, 12);
    const spy = JSON.parse(fs.readFileSync(path.join(root, "manifests", "market-data", "series", "spy.json"), "utf8"));
    assert.equal(spy.fetch_vendor, "yahoo-chart");
    assert.match(spy.source_url, /finance\.yahoo\.com/i);
    assert.ok(fs.existsSync(path.join(root, "raw", "market-data", "spy.json")));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

runTest("scenario refresh tolerates missing uncached feature series when the tradable panel is still wide enough", () => {
  const root = makeTempRepo();
  try {
    initProject(root);
    writeScenarioConfigs(root);
    seedScenarioContext(root);

    const refresh = refreshMarketData(root, {
      profile: "test-probability-engine",
      fetcher: buildFeatureFailureFetcher("base")
    });
    const scenario = refreshScenario(root, "Test Probability Engine", {
      profile: "test-probability-engine",
      paths: 1800,
      horizons: "5,21,63",
      seed: 5,
      "no-market-refresh": true
    });

    assert.equal(refresh.failures.length, 2);
    assert.ok(refresh.failures.some((entry) => entry.id === "DGS10"));
    assert.ok(refresh.failures.some((entry) => entry.id === "T10YIE"));
    assert.ok((scenario.model.diagnostics.missing_series || []).includes("DGS10"));
    assert.ok((scenario.model.diagnostics.missing_series || []).includes("T10YIE"));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

runTest("scenario refresh writes a probability surface and indexes it through compile", () => {
  const root = makeTempRepo();
  try {
    initProject(root);
    writeScenarioConfigs(root);
    seedScenarioContext(root);

    const scenario = refreshScenario(root, "Test Probability Engine", {
      profile: "test-probability-engine",
      fetcher: buildFetcher("base"),
      paths: 2500,
      horizons: "5,21,63,126",
      seed: 7
    });
    const compileResult = compileProject(root);

    assert.equal(scenario.profile.id, "test-probability-engine");
    assert.ok(fs.existsSync(path.join(root, scenario.probabilityPath)));
    assert.ok(fs.existsSync(path.join(root, "manifests", "scenario_history.jsonl")));
    assert.ok(fs.existsSync(path.join(root, "wiki", "_indices", "probabilities.md")));
    assert.ok(compileResult.probabilityPages >= 1);
    assert.ok(scenario.overlay.subjects.length >= 1);
    assert.ok(scenario.model.current_regime.label);
    assert.ok(scenario.model.horizons["5"]);
    assert.ok((scenario.model.archetypes || []).length >= 1);

    const probabilityPage = fs.readFileSync(path.join(root, scenario.probabilityPath), "utf8");
    const parsed = parseFrontmatter(probabilityPage);
    assert.equal(parsed.frontmatter.kind, "probability-page");
    assert.equal(parsed.frontmatter.profile_id, "test-probability-engine");
    assert.match(probabilityPage, /Managed Current Regime/);
    assert.match(probabilityPage, /Managed Scenario Archetypes/);
    assert.match(probabilityPage, /Managed Transmission Map/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

runTest("scenario refresh uses the configured default path count when no explicit paths override is supplied", () => {
  const root = makeTempRepo();
  try {
    initProject(root);
    writeScenarioConfigs(root);
    seedScenarioContext(root);

    const scenario = refreshScenario(root, "Test Probability Engine", {
      profile: "test-probability-engine",
      fetcher: buildFetcher("base"),
      horizons: "5,21",
      seed: 13
    });

    assert.equal(scenario.model.paths, 4000);
    const probabilityPage = fs.readFileSync(path.join(root, scenario.probabilityPath), "utf8");
    assert.match(probabilityPage, /Simulation paths: 4,000/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

runTest("scenario diff compares consecutive probability snapshots", () => {
  const root = makeTempRepo();
  try {
    initProject(root);
    writeScenarioConfigs(root);
    seedScenarioContext(root);

    refreshScenario(root, "Test Probability Engine", {
      profile: "test-probability-engine",
      fetcher: buildFetcher("base"),
      paths: 2000,
      horizons: "5,21,63",
      seed: 11
    });
    refreshScenario(root, "Test Probability Engine", {
      profile: "test-probability-engine",
      fetcher: buildFetcher("shock"),
      paths: 2000,
      horizons: "5,21,63",
      seed: 11
    });

    const diff = writeScenarioDiff(root, "Test Probability Engine", {
      profile: "test-probability-engine"
    });

    assert.ok(diff.outputPath);
    assert.ok(fs.existsSync(path.join(root, diff.outputPath)));
    const content = fs.readFileSync(path.join(root, diff.outputPath), "utf8");
    assert.match(content, /Scenario Diff/);
    assert.match(content, /Regime Probability Shift/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

runTest("probability brief authored pack captures a model-authored output against the probability surface", () => {
  const root = makeTempRepo();
  try {
    initProject(root);
    writeScenarioConfigs(root);
    seedScenarioContext(root);
    refreshMarketData(root, {
      profile: "test-probability-engine",
      fetcher: buildFetcher("base")
    });

    const pack = writeAuthoredPack(root, "probability-brief", "Test Probability Engine", {
      profile: "test-probability-engine",
      paths: 1500,
      horizons: "5,21,63",
      seed: 21,
      "no-market-refresh": true
    });

    const capture = captureModelAuthoredOutput(
      root,
      pack,
      `# Test Probability Engine probability brief

## Executive Summary

North Asia hardware remains the highest-conviction upside path, but price, rates, and oil still set the tactical risk budget.

## Probabilistic Read-Through

- The probability surface still favors hardware leadership over a broad market melt-up.
- The main downside branch is an oil-led rates shock that narrows the upside distribution quickly.

## Falsifiers And Tripwires

- A sustained oil surge with rising long-end yields would weaken the current upside skew.
- If semiconductor leadership breaks while defense starts outperforming, the current regime call is wrong.
`
    );

    assert.ok(fs.existsSync(path.join(root, capture.outputResult.outputPath)));
    const authored = fs.readFileSync(path.join(root, capture.outputResult.outputPath), "utf8");
    assert.match(authored, /terminal_model_probability_brief/);
    assert.match(authored, /North Asia hardware remains the highest-conviction upside path/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
