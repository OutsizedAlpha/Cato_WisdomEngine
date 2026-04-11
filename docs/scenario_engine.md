# Scenario Engine

This file records the live probability subsystem as of 2026-04-11.

## Purpose

The scenario engine gives Cato a forward-looking probability layer for short-horizon market work.

Its job is to:

- refresh and cache cross-asset market history through Cato-managed web pulls
- infer the active regime from synchronized market data
- map intermarket transmission rather than treating each asset in isolation
- simulate forward paths over `5`, `21`, `63`, and `126` trading-day horizons
- write canonical probability surfaces that later reports and briefs can reuse

## Core Rule

Do not pretend prose corpus is calibration data.

The live split is:

- market data = calibration truth
- corpus and self-model = structural overlay, priors, and interpretation
- canonical probability page = deterministic scenario artefact
- probability brief = model-authored judgement over that artefact

Canonical scenario work should default to `100,000` paths unless there is a deliberate override.

## Runtime Shape

### 1. Node Orchestration

Cato owns:

- market-data acquisition and caching
- scenario profile resolution
- corpus/state overlay construction
- snapshot history and canonical markdown writes
- authored brief pack preparation

Primary files:

- `src/market-data.js`
- `src/scenario.js`
- `config/market_series.json`
- `config/scenario_profiles.json`

### 2. Python Quant Core

Python owns:

- factor extraction
- regime inference
- persistence and transition modelling
- Monte Carlo path generation
- distributional statistics and scenario archetypes

Primary file:

- `tools/run_probability_engine.py`

## Four Mathematical Layers

### 1. Structural Overlay

The engine builds a bias or overlay vector from Cato state and corpus context.

That overlay:

- does not invent prices
- does not replace calibration data
- does shift regime posterior weight toward or away from paths that match the current structural read

### 2. Regime Inference

The engine turns synchronized market history into latent factors, then fits regime structure over those factors.

The live implementation uses:

- return and change frames built from cached market history
- PCA factor extraction
- Gaussian-mixture regime inference
- information-criterion selection for regime count

### 3. Intermarket Transmission Mapping

This is the explicit intermarket layer.

It uses the factor model and asset loadings to show which markets are carrying the regime:

- equities and regional leadership
- rates and duration pressure
- dollar and liquidity conditions
- commodity and inflation impulse

### 4. Monte Carlo Path Simulation

This is the forward path layer.

The live implementation uses:

- regime-conditioned factor means and covariances
- Ledoit-Wolf shrinkage
- duration-aware persistence logic
- multivariate Student-t shocks for fatter tails
- residual noise projected back into asset space

The goal is not a decorative random walk. The goal is a regime-aware, cross-asset, fat-tailed path engine.

## File Layout

Market history:

- `raw/market-data/`
- `manifests/market-data/series/`

Scenario history:

- `manifests/scenario_history.jsonl`
- `logs/actions/scenario_runs.jsonl`

Canonical surfaces:

- `wiki/probabilities/`

Operator pack path:

- `cache/authored-packs/`

## Main Commands

- `.\cato.cmd market-refresh --profile global-risk-regime`
- `.\cato.cmd scenario-refresh "Global Risk Regime" --profile global-risk-regime --paths 100000`
- `.\cato.cmd scenario-diff "Global Risk Regime" --profile global-risk-regime`
- `.\cato.cmd probability-brief "Global Risk Regime" --profile global-risk-regime --paths 100000`

## Output Contract

`scenario-refresh` writes the canonical probability surface.

That surface should be the reusable reference for:

- report updates
- regime monitoring
- scenario diffs
- authored probability briefs

Do not treat an old lint log, an old brief, or an old cached bundle as the current truth if a newer canonical probability page exists.

## Public / Private Boundary

The scenario engine itself is public-safe.

These belong in the public engine line:

- code
- configs
- tests
- docs

These stay private unless deliberately generalized:

- private cached market history
- private probability surfaces tied to private corpus or private state
- private authored briefs and reports built from that private working set
