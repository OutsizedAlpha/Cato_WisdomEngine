const fs = require("node:fs");
const path = require("node:path");
const { DEFAULT_WEB_USER_AGENT, invokeWebRequest } = require("./http-runtime");
const { ensureProjectStructure } = require("./project");
const {
  appendJsonl,
  ensureDir,
  nowIso,
  readJson,
  relativeToRoot,
  slugify,
  writeJson,
  writeText
} = require("./utils");

const MARKET_FETCH_USER_AGENT = DEFAULT_WEB_USER_AGENT;

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

function normalizeSeriesId(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function marketSourceUrl(definition) {
  if (definition.source_url) {
    return String(definition.source_url).trim();
  }
  if (definition.vendor === "stooq") {
    return `https://stooq.com/q/d/l/?s=${encodeURIComponent(definition.symbol)}&i=d`;
  }
  if (definition.vendor === "fred") {
    return `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(definition.symbol)}`;
  }
  throw new Error(`Unsupported market-data vendor: ${definition.vendor}`);
}

function yahooChartSymbol(definition) {
  const configured = String(definition.yahoo_symbol || "").trim();
  if (configured) {
    return configured;
  }
  const raw = String(definition.symbol || definition.id || "")
    .trim()
    .split(".")[0]
    .toUpperCase();
  return raw || normalizeSeriesId(definition.id);
}

function yahooChartUrl(definition) {
  return `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooChartSymbol(definition))}?interval=1d&range=10y&includeAdjustedClose=true`;
}

function fetchRemoteSeries(definition, url, fetcher) {
  if (typeof fetcher === "function") {
    return fetcher(definition, url);
  }
  return invokeWebRequest({
    url,
    headers: {
      "User-Agent": MARKET_FETCH_USER_AGENT,
      Accept: "text/csv,application/json,text/plain,*/*"
    },
    timeoutSec: 30,
    timeoutMs: 90_000,
    maxBuffer: 64 * 1024 * 1024
  });
}

function parseCsvLines(content) {
  return String(content || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseStooqSeries(content) {
  const lines = parseCsvLines(content);
  if (lines.length < 2) {
    throw new Error("Stooq payload was empty.");
  }
  const [headerLine, ...rows] = lines;
  const headers = headerLine.split(",").map((value) => value.trim().toLowerCase());
  const dateIndex = headers.indexOf("date");
  const closeIndex = headers.indexOf("close");
  if (dateIndex === -1 || closeIndex === -1) {
    throw new Error("Stooq payload did not include Date/Close columns.");
  }

  return rows
    .map((line) => line.split(","))
    .map((columns) => ({
      date: String(columns[dateIndex] || "").trim(),
      value: Number.parseFloat(String(columns[closeIndex] || "").trim())
    }))
    .filter((entry) => entry.date && Number.isFinite(entry.value))
    .sort((left, right) => left.date.localeCompare(right.date));
}

function parseFredSeries(content) {
  const lines = parseCsvLines(content);
  if (lines.length < 2) {
    throw new Error("FRED payload was empty.");
  }
  const [headerLine, ...rows] = lines;
  const headers = headerLine.split(",").map((value) => value.trim().toUpperCase());
  const dateIndex = headers.indexOf("DATE");
  const valueIndex = Math.max(headers.indexOf("VALUE"), 1);
  if (dateIndex === -1 || valueIndex === -1) {
    throw new Error("FRED payload did not include DATE/VALUE columns.");
  }

  return rows
    .map((line) => line.split(","))
    .map((columns) => ({
      date: String(columns[dateIndex] || "").trim(),
      value: Number.parseFloat(String(columns[valueIndex] || "").trim())
    }))
    .filter((entry) => entry.date && Number.isFinite(entry.value))
    .sort((left, right) => left.date.localeCompare(right.date));
}

function parseYahooChartSeries(content) {
  const payload = JSON.parse(String(content || "{}"));
  const result = payload?.chart?.result?.[0];
  const timestamps = Array.isArray(result?.timestamp) ? result.timestamp : [];
  const adjustedClose = result?.indicators?.adjclose?.[0]?.adjclose;
  const close = result?.indicators?.quote?.[0]?.close;
  const values = Array.isArray(adjustedClose) && adjustedClose.some((value) => Number.isFinite(Number(value))) ? adjustedClose : close;
  if (!timestamps.length || !Array.isArray(values)) {
    throw new Error("Yahoo chart payload was empty.");
  }

  return timestamps
    .map((timestamp, index) => ({
      date: new Date(Number(timestamp) * 1000).toISOString().slice(0, 10),
      value: Number.parseFloat(String(values[index]))
    }))
    .filter((entry) => entry.date && Number.isFinite(entry.value))
    .sort((left, right) => left.date.localeCompare(right.date));
}

function parseSeriesPayload(definition, content) {
  switch (definition.vendor) {
    case "stooq":
      return parseStooqSeries(content);
    case "fred":
      return parseFredSeries(content);
    case "yahoo-chart":
      return parseYahooChartSeries(content);
    default:
      throw new Error(`Unsupported market-data vendor: ${definition.vendor}`);
  }
}

function mergeObservations(existing = [], incoming = []) {
  const merged = new Map();
  for (const entry of [...existing, ...incoming]) {
    if (!entry?.date || !Number.isFinite(Number(entry.value))) {
      continue;
    }
    merged.set(String(entry.date), Number(entry.value));
  }
  return [...merged.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([date, value]) => ({
      date,
      value
    }));
}

function loadMarketSeriesConfig(root) {
  const config = readJson(path.join(root, "config", "market_series.json"), { version: 1, series: [] });
  return {
    version: Number(config.version || 1),
    series: Array.isArray(config.series) ? config.series.map((series) => ({ ...series, id: normalizeSeriesId(series.id) })) : []
  };
}

function loadScenarioProfiles(root) {
  const config = readJson(path.join(root, "config", "scenario_profiles.json"), {
    version: 1,
    default_paths: 100000,
    default_horizons: [5, 21, 63, 126],
    profiles: []
  });
  return {
    version: Number(config.version || 1),
    defaultPaths: Number(config.default_paths || 100000),
    defaultHorizons: Array.isArray(config.default_horizons) ? config.default_horizons.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0) : [5, 21, 63, 126],
    profiles: Array.isArray(config.profiles)
      ? config.profiles.map((profile) => ({
          ...profile,
          id: slugify(profile.id || profile.title || ""),
          title: profile.title || profile.id || "Scenario Profile",
          series: normalizeList(profile.series).map(normalizeSeriesId),
          driver_series: normalizeList(profile.driver_series).map(normalizeSeriesId),
          anchor_series: normalizeList(profile.anchor_series).map(normalizeSeriesId),
          subjects: normalizeList(profile.subjects)
        }))
      : []
  };
}

function resolveScenarioProfile(root, seed = "", options = {}) {
  const profiles = loadScenarioProfiles(root);
  const candidates = profiles.profiles;
  if (!candidates.length) {
    throw new Error("No scenario profiles are configured.");
  }

  const preferred = String(options.profile || "").trim();
  const normalizedPreferred = slugify(preferred);
  const normalizedSeed = slugify(seed);
  const match =
    candidates.find((profile) => profile.id === normalizedPreferred || slugify(profile.title) === normalizedPreferred) ||
    candidates.find((profile) => profile.id === normalizedSeed || slugify(profile.title) === normalizedSeed) ||
    candidates.find((profile) => profile.id === "global-risk-regime") ||
    candidates[0];

  return {
    profile: match,
    defaults: {
      paths: profiles.defaultPaths,
      horizons: profiles.defaultHorizons
    }
  };
}

function resolveSeriesDefinitions(root, profile, options = {}) {
  const config = loadMarketSeriesConfig(root);
  const requested = normalizeList(options.series).map(normalizeSeriesId);
  const ids = requested.length ? requested : profile?.series || config.series.map((series) => series.id);
  const selected = ids
    .map((id) => config.series.find((series) => normalizeSeriesId(series.id) === normalizeSeriesId(id)))
    .filter(Boolean);

  if (!selected.length) {
    throw new Error("No market series matched the requested profile or series list.");
  }

  return selected;
}

function marketSeriesFileName(seriesId) {
  return `${slugify(seriesId).slice(0, 80) || "series"}.json`;
}

function marketSeriesManifestRelativePath(seriesId) {
  return path.join("manifests", "market-data", "series", marketSeriesFileName(seriesId)).replace(/\\/g, "/");
}

function marketSeriesRawRelativePath(seriesId, extension = ".csv") {
  return path.join("raw", "market-data", `${slugify(seriesId).slice(0, 80) || "series"}${extension}`).replace(/\\/g, "/");
}

function loadSeriesHistory(root, seriesId) {
  return readJson(path.join(root, marketSeriesManifestRelativePath(seriesId)), null);
}

function updateMarketCatalog(root, summaries) {
  const catalogPath = path.join(root, "manifests", "market_data_catalog.json");
  const current = readJson(catalogPath, { version: 1, updated_at: "", series: [] });
  const merged = new Map(
    (Array.isArray(current.series) ? current.series : []).map((entry) => [normalizeSeriesId(entry.id), entry])
  );
  for (const summary of summaries) {
    merged.set(normalizeSeriesId(summary.id), summary);
  }
  const next = {
    version: 1,
    updated_at: nowIso(),
    series: [...merged.values()].sort((left, right) => String(left.id).localeCompare(String(right.id)))
  };
  writeJson(catalogPath, next);
  return relativeToRoot(root, catalogPath);
}

function refreshMarketData(root, options = {}) {
  ensureProjectStructure(root);
  const { profile } = resolveScenarioProfile(root, options.topic || options.profile || "", options);
  const selected = resolveSeriesDefinitions(root, profile, options);
  const refreshed = [];
  const failures = [];
  const fetchedAt = nowIso();

  for (const definition of selected) {
    const manifestRelativePath = marketSeriesManifestRelativePath(definition.id);
    const manifestAbsolutePath = path.join(root, manifestRelativePath);
    const existing = readJson(manifestAbsolutePath, {
      id: definition.id,
      title: definition.title,
      vendor: definition.vendor,
      symbol: definition.symbol,
      kind: definition.kind,
      transform: definition.transform || "log_return",
      simulate: definition.simulate !== false,
      groups: definition.groups || [],
      observations: []
    });
    try {
      const url = marketSourceUrl(definition);
      let fetchVendor = definition.vendor;
      let payload = fetchRemoteSeries(definition, url, options.fetcher);
      let content = String(payload.content || "");
      let observations;
      try {
        observations = parseSeriesPayload(definition, content);
      } catch (error) {
        if (definition.vendor !== "stooq") {
          throw error;
        }
        fetchVendor = "yahoo-chart";
        const fallbackUrl = yahooChartUrl(definition);
        payload = fetchRemoteSeries({ ...definition, vendor: fetchVendor }, fallbackUrl, options.fetcher);
        content = String(payload.content || "");
        observations = parseSeriesPayload({ ...definition, vendor: fetchVendor }, content);
      }
      const merged = mergeObservations(existing.observations, observations);
      const rawRelativePath = marketSeriesRawRelativePath(definition.id, fetchVendor === "yahoo-chart" ? ".json" : ".csv");
      writeText(path.join(root, rawRelativePath), content);
      writeJson(manifestAbsolutePath, {
        id: definition.id,
        title: definition.title,
        vendor: definition.vendor,
        fetch_vendor: fetchVendor,
        symbol: definition.symbol,
        kind: definition.kind || "price",
        transform: definition.transform || "log_return",
        simulate: definition.simulate !== false,
        groups: definition.groups || [],
        source_url: String(payload.final_url || url),
        raw_path: rawRelativePath,
        updated_at: fetchedAt,
        observation_count: merged.length,
        first_date: merged[0]?.date || "",
        last_date: merged[merged.length - 1]?.date || "",
        observations: merged
      });
      refreshed.push({
        id: definition.id,
        title: definition.title,
        vendor: definition.vendor,
        fetch_vendor: fetchVendor,
        symbol: definition.symbol,
        kind: definition.kind || "price",
        transform: definition.transform || "log_return",
        simulate: definition.simulate !== false,
        raw_path: rawRelativePath,
        manifest_path: manifestRelativePath,
        source_url: String(payload.final_url || url),
        observation_count: merged.length,
        first_date: merged[0]?.date || "",
        last_date: merged[merged.length - 1]?.date || "",
        updated_at: fetchedAt
      });
    } catch (error) {
      failures.push({
        id: definition.id,
        message: String(error.message || error).trim()
      });
      if (Array.isArray(existing.observations) && existing.observations.length) {
        refreshed.push({
          id: definition.id,
          title: definition.title,
          vendor: definition.vendor,
          fetch_vendor: existing.fetch_vendor || definition.vendor,
          symbol: definition.symbol,
          kind: definition.kind || existing.kind || "price",
          transform: definition.transform || existing.transform || "log_return",
          simulate: definition.simulate !== false,
          raw_path: existing.raw_path || "",
          manifest_path: manifestRelativePath,
          source_url: existing.source_url || "",
          observation_count: Number(existing.observation_count || existing.observations.length || 0),
          first_date: existing.first_date || existing.observations[0]?.date || "",
          last_date: existing.last_date || existing.observations[existing.observations.length - 1]?.date || "",
          updated_at: existing.updated_at || "",
          reused_cache: true
        });
        continue;
      }
    }
  }

  if (!refreshed.length) {
    throw new Error(failures.length ? failures.map((entry) => `${entry.id}: ${entry.message}`).join(" | ") : "Market refresh produced no usable series.");
  }

  const catalogPath = updateMarketCatalog(root, refreshed);
  appendJsonl(path.join(root, "logs", "actions", "market_refresh.jsonl"), {
    event: "market_refresh",
    at: fetchedAt,
    profile_id: profile.id,
    failures,
    series: refreshed.map((entry) => ({
      id: entry.id,
      count: entry.observation_count,
      last_date: entry.last_date
    }))
  });

  return {
    profileId: profile.id,
    refreshed: refreshed.length,
    series: refreshed,
    failures,
    catalogPath
  };
}

module.exports = {
  loadMarketSeriesConfig,
  loadScenarioProfiles,
  loadSeriesHistory,
  marketSeriesManifestRelativePath,
  marketSeriesRawRelativePath,
  marketSourceUrl,
  refreshMarketData,
  resolveScenarioProfile,
  resolveSeriesDefinitions
};
