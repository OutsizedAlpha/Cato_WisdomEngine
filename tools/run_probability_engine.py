#!/usr/bin/env python
import argparse
import json
import math
from collections import Counter, defaultdict

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.covariance import LedoitWolf
from sklearn.decomposition import PCA
from sklearn.mixture import GaussianMixture


def load_payload(path):
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def write_payload(path, payload):
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)
        handle.write("\n")


def safe_float(value, fallback=0.0):
    try:
        number = float(value)
        if math.isfinite(number):
            return number
    except Exception:
        pass
    return fallback


def as_sorted_unique(values):
    cleaned = []
    for value in values:
        number = safe_float(value, None)
        if number is None:
            continue
        rounded = int(round(number))
        if rounded > 0:
            cleaned.append(rounded)
    return sorted(set(cleaned))


def build_value_frame(series_payloads):
    columns = {}
    meta = {}
    missing = []
    for series in series_payloads:
        observations = series.get("values") or []
        if not observations:
            missing.append(series["id"])
            continue
        index = []
        values = []
        for obs in observations:
            date = str(obs.get("date", "")).strip()
            value = safe_float(obs.get("value"), None)
            if not date or value is None:
                continue
            index.append(date)
            values.append(value)
        if not values:
            missing.append(series["id"])
            continue
        series_obj = pd.Series(values, index=pd.to_datetime(index), dtype=float).sort_index()
        series_obj = series_obj[~series_obj.index.duplicated(keep="last")]
        columns[series["id"]] = series_obj
        meta[series["id"]] = series
    if not columns:
        raise RuntimeError("No usable market series were supplied to the probability engine.")
    frame = pd.DataFrame(columns).sort_index()
    frame = frame.ffill(limit=5)
    return frame, meta, missing


def build_return_frame(value_frame, meta):
    returns = {}
    for series_id, definition in meta.items():
        values = value_frame[series_id].astype(float)
        transform = str(definition.get("transform", "log_return")).strip().lower()
        if transform == "diff":
            transformed = values.diff()
        else:
            transformed = np.log(values).diff()
        returns[series_id] = transformed
    frame = pd.DataFrame(returns).replace([np.inf, -np.inf], np.nan)
    frame = frame.dropna(axis=0, how="any")
    if frame.shape[0] < 180 or frame.shape[1] < 4:
        raise RuntimeError("Synchronized market history is too short or too narrow for regime modelling.")
    return frame


def pick_factor_count(z_scores):
    max_components = min(4, z_scores.shape[1], z_scores.shape[0] - 1)
    min_components = min(2, max_components)
    if max_components <= 1:
        return 1
    probe = PCA(n_components=max_components, random_state=42)
    probe.fit(z_scores)
    cumulative = np.cumsum(probe.explained_variance_ratio_)
    chosen = np.searchsorted(cumulative, 0.85) + 1
    return max(min_components, min(max_components, int(chosen)))


def build_factor_model(return_frame):
    global_std = return_frame.std(axis=0).replace(0, np.nan).fillna(return_frame.std(axis=0).mean()).replace(0, 1.0)
    z_scores = (return_frame / global_std).astype(float)
    factor_count = pick_factor_count(z_scores.values)
    pca = PCA(n_components=factor_count, random_state=42)
    factors = pca.fit_transform(z_scores.values)
    reconstructed = pca.inverse_transform(factors)
    residuals = z_scores.values - reconstructed
    return {
        "z_scores": z_scores,
        "global_std": global_std,
        "pca": pca,
        "factors": pd.DataFrame(
            factors,
            index=return_frame.index,
            columns=[f"factor_{index + 1}" for index in range(factor_count)]
        ),
        "residuals": pd.DataFrame(residuals, index=return_frame.index, columns=return_frame.columns)
    }


def build_feature_matrix(factors):
    features = pd.concat(
        [
            factors,
            factors.rolling(5).mean().add_prefix("m5_"),
            factors.rolling(21).mean().add_prefix("m21_"),
            factors.rolling(21).std().add_prefix("v21_")
        ],
        axis=1
    ).dropna()
    if features.shape[0] < 120:
        raise RuntimeError("Feature matrix is too short after rolling-window construction.")
    return features


def choose_regime_model(features, regime_config, seed):
    min_regimes = max(2, int(regime_config.get("min", 3)))
    max_regimes = max(min_regimes, int(regime_config.get("max", 6)))
    max_allowed = max(min_regimes, min(max_regimes, max(2, features.shape[0] // 90)))
    candidates = range(min_regimes, max_allowed + 1)
    best = None
    bic_scores = []

    for k in candidates:
        model = GaussianMixture(
            n_components=k,
            covariance_type="full",
            n_init=3,
            max_iter=300,
            random_state=seed
        )
        model.fit(features.values)
        bic = float(model.bic(features.values))
        bic_scores.append({"regimes": k, "bic": bic})
        if best is None or bic < best["bic"]:
            best = {"bic": bic, "model": model, "regimes": k}

    labels = best["model"].predict(features.values)
    probabilities = best["model"].predict_proba(features.values)
    return {
        "model": best["model"],
        "labels": labels,
        "probabilities": probabilities,
        "bic_scores": bic_scores,
        "selected_regimes": best["regimes"]
    }


def composite_mean(return_frame, members):
    available = [member for member in members if member in return_frame.columns]
    if not available:
        return pd.Series(0.0, index=return_frame.index)
    return return_frame[available].mean(axis=1)


def build_composite_frame(return_frame, profile):
    composites = {}
    for composite_id, definition in (profile.get("composites") or {}).items():
        composites[composite_id] = composite_mean(return_frame, definition.get("members") or [])
    return pd.DataFrame(composites, index=return_frame.index)


def regime_order(labels, composite_frame):
    regime_ids = sorted(set(int(label) for label in labels))
    scores = {}
    for regime_id in regime_ids:
        mask = labels == regime_id
        risk = float(composite_frame.loc[mask, "risk"].mean()) if "risk" in composite_frame.columns else 0.0
        defense = float(composite_frame.loc[mask, "defense"].mean()) if "defense" in composite_frame.columns else 0.0
        hardware = float(composite_frame.loc[mask, "hardware"].mean()) if "hardware" in composite_frame.columns else 0.0
        north_asia = float(composite_frame.loc[mask, "north_asia"].mean()) if "north_asia" in composite_frame.columns else 0.0
        energy = 0.0
        for key in ("energy", "energy_inflation"):
            if key in composite_frame.columns:
                energy = float(composite_frame.loc[mask, key].mean())
                break
        scores[regime_id] = risk + 0.7 * hardware + 0.5 * north_asia - 0.4 * defense - 0.3 * energy
    ordered = sorted(regime_ids, key=lambda regime_id: scores[regime_id], reverse=True)
    return {old: new for new, old in enumerate(ordered)}


def relabel_regimes(labels, probabilities, mapping):
    new_labels = np.array([mapping[int(label)] for label in labels], dtype=int)
    order = [old for old, _new in sorted(mapping.items(), key=lambda item: item[1])]
    new_probabilities = probabilities[:, order]
    return new_labels, new_probabilities


def contiguous_runs(labels):
    runs = []
    if len(labels) == 0:
        return runs
    current = int(labels[0])
    length = 1
    for label in labels[1:]:
        label = int(label)
        if label == current:
            length += 1
            continue
        runs.append((current, length))
        current = label
        length = 1
    runs.append((current, length))
    return runs


def build_duration_models(labels, regime_count):
    runs = contiguous_runs(labels)
    by_regime = defaultdict(list)
    transitions = np.ones((regime_count, regime_count), dtype=float)
    np.fill_diagonal(transitions, 0.0)

    for index, (regime, length) in enumerate(runs):
        by_regime[int(regime)].append(int(length))
        if index + 1 < len(runs):
            next_regime = int(runs[index + 1][0])
            if next_regime != regime:
                transitions[int(regime), next_regime] += 1.0

    duration_models = []
    for regime_id in range(regime_count):
        durations = by_regime.get(regime_id) or [1]
        max_duration = max(durations)
        counts = np.ones(max_duration, dtype=float)
        for duration in durations:
            counts[duration - 1] += 1.0
        pmf = counts / counts.sum()
        survival = np.flip(np.cumsum(np.flip(pmf)))
        hazards = np.clip(pmf / np.maximum(survival, 1e-9), 0.02, 0.95)
        tail_hazard = float(np.mean(hazards[-min(5, len(hazards)):]))
        duration_models.append(
            {
                "durations": durations,
                "pmf": pmf,
                "hazards": hazards,
                "tail_hazard": tail_hazard,
                "median_duration_days": float(np.median(durations))
            }
        )

    leave_probabilities = []
    for regime_id in range(regime_count):
        row = transitions[regime_id].copy()
        row[regime_id] = 0.0
        if row.sum() <= 0:
            row = np.ones(regime_count, dtype=float)
            row[regime_id] = 0.0
        row = row / row.sum()
        leave_probabilities.append(row)

    return duration_models, leave_probabilities


def regime_mean_map(return_frame, composite_frame, labels, regime_count):
    regime_stats = []
    for regime_id in range(regime_count):
        mask = labels == regime_id
        slice_returns = return_frame.loc[mask]
        slice_composites = composite_frame.loc[mask] if not composite_frame.empty else pd.DataFrame(index=slice_returns.index)
        regime_stats.append(
            {
                "series_mean": slice_returns.mean(axis=0).to_dict(),
                "composites_mean": slice_composites.mean(axis=0).to_dict() if not slice_composites.empty else {}
            }
        )
    return regime_stats


def label_regime(profile_id, stats, fallback_index):
    risk = safe_float(stats.get("risk"), 0.0)
    defense = safe_float(stats.get("defense"), 0.0)
    hardware = safe_float(stats.get("hardware"), safe_float(stats.get("asia_hardware"), 0.0))
    north_asia = safe_float(stats.get("north_asia"), safe_float(stats.get("asia_hardware"), 0.0))
    energy = safe_float(stats.get("energy"), safe_float(stats.get("energy_inflation"), 0.0))

    if profile_id == "north-asia-ai-hardware" and north_asia > 0.0005 and hardware > 0.0007:
        return "North Asia hardware leadership"
    if risk > 0.0005 and defense < 0.0002 and energy <= 0.0002:
        return "Risk-on disinflation / hardware leadership" if hardware > 0.0005 else "Risk-on disinflation"
    if risk < -0.0003 and energy > 0.0004:
        return "Inflation shock / energy squeeze"
    if risk < -0.0003 and defense > 0.0003:
        return "Growth scare / duration bid"
    if risk > 0.0003 and energy > 0.0004:
        return "Reflation / higher-rate risk-on"
    if hardware > 0.0005 and risk >= -0.0002:
        return "Selective hardware leadership"
    if defense > 0.0004 and risk >= -0.0002:
        return "Defensive carry / slower growth"
    return f"Cross-asset regime {fallback_index + 1}"


def estimate_t_df(factor_slice):
    if factor_slice.shape[0] < 20:
        return 8.0
    kurtosis = pd.DataFrame(factor_slice).kurtosis(axis=0).replace([np.inf, -np.inf], np.nan).dropna()
    if kurtosis.empty:
        return 8.0
    positive = kurtosis[kurtosis > 0]
    if positive.empty:
        return 30.0
    implied = 6.0 / positive.median() + 4.0
    return float(np.clip(implied, 5.0, 40.0))


def build_regime_models(factor_frame, residual_frame, return_frame, labels, regime_count):
    models = []
    for regime_id in range(regime_count):
        mask = labels == regime_id
        factor_slice = factor_frame.loc[mask].values
        residual_slice = residual_frame.loc[mask].values
        return_slice = return_frame.loc[mask].values
        if factor_slice.shape[0] < 12:
            factor_slice = factor_frame.values
            residual_slice = residual_frame.values
            return_slice = return_frame.values
        covariance = LedoitWolf().fit(factor_slice).covariance_
        mean_vector = factor_slice.mean(axis=0)
        residual_std = np.nanstd(residual_slice, axis=0)
        residual_std = np.where(np.isfinite(residual_std) & (residual_std > 1e-8), residual_std, np.nanstd(residual_frame.values, axis=0))
        residual_std = np.where(np.isfinite(residual_std) & (residual_std > 1e-8), residual_std, 0.01)
        mean_series = return_slice.mean(axis=0)
        models.append(
            {
                "factor_mean": mean_vector,
                "factor_cov": covariance,
                "residual_std": residual_std,
                "mean_series": mean_series,
                "df": estimate_t_df(factor_slice)
            }
        )
    return models


def overlay_adjustments(overlay, series_order, regime_models, latest_posterior):
    bias_vector = np.array(
        [safe_float((overlay.get("seriesBiasBpsPerDay") or {}).get(series_id), 0.0) / 10000.0 for series_id in series_order],
        dtype=float
    )
    overlay_strength = float(np.clip(np.mean(np.abs(bias_vector)) * 10000.0 / 4.0, 0.0, 1.5)) * 0.35
    if overlay_strength <= 0:
        return latest_posterior, overlay_strength

    similarities = []
    for regime_model in regime_models:
        mean_series = regime_model["mean_series"]
        denom = np.linalg.norm(mean_series) * np.linalg.norm(bias_vector)
        similarity = float(np.dot(mean_series, bias_vector) / denom) if denom > 0 else 0.0
        similarities.append(similarity)

    logits = np.log(np.clip(latest_posterior, 1e-9, None)) + overlay_strength * np.array(similarities)
    logits -= np.max(logits)
    posterior = np.exp(logits)
    posterior /= posterior.sum()
    return posterior, overlay_strength


def multivariate_t(mean, covariance, degrees_of_freedom, draws, rng):
    dimensions = len(mean)
    gaussian = rng.multivariate_normal(np.zeros(dimensions), covariance, size=draws)
    scale = rng.chisquare(degrees_of_freedom, size=draws) / degrees_of_freedom
    return mean + gaussian / np.sqrt(scale)[:, None]


def stay_probability(duration, duration_model):
    hazards = duration_model["hazards"]
    if duration <= len(hazards):
        hazard = hazards[duration - 1]
    else:
        hazard = duration_model["tail_hazard"]
    return float(np.clip(1.0 - hazard, 0.05, 0.98))


def composite_from_returns(cumulative_returns, composite_members, series_index):
    members = [series_index[member] for member in composite_members if member in series_index]
    if not members:
        return np.zeros(cumulative_returns.shape[0], dtype=float)
    return cumulative_returns[:, members].mean(axis=1)


def label_archetype(entry):
    composites = entry["composite_median_returns"]
    risk = safe_float(composites.get("risk"), 0.0)
    defense = safe_float(composites.get("defense"), 0.0)
    energy = safe_float(composites.get("energy"), safe_float(composites.get("energy_inflation"), 0.0))
    hardware = safe_float(composites.get("hardware"), safe_float(composites.get("asia_hardware"), 0.0))
    north_asia = safe_float(composites.get("north_asia"), safe_float(composites.get("asia_hardware"), 0.0))
    if north_asia > 2.0 and hardware > 3.0:
        return "North Asia hardware upside path"
    if risk > 2.0 and hardware > 3.0:
        return "Risk-on hardware continuation"
    if risk < -2.0 and energy > 2.0:
        return "Oil shock / risk-off path"
    if risk < -2.0 and defense > 1.0:
        return "Growth scare / duration rescue path"
    if risk > 1.0 and energy > 1.5:
        return "Reflation / higher-rate squeeze path"
    return f"{entry['end_regime']} path"


def extract_archetypes(sample_features, sample_metadata, archetype_count, rng):
    if sample_features.shape[0] < 40:
        return []
    clusters = max(2, min(archetype_count, sample_features.shape[0] // 25))
    model = KMeans(n_clusters=clusters, random_state=int(rng.integers(0, 10_000)), n_init=10)
    labels = model.fit_predict(sample_features)
    archetypes = []
    for cluster_id in range(clusters):
        mask = labels == cluster_id
        probability = float(mask.mean())
        if probability <= 0:
            continue
        cluster_rows = sample_metadata.loc[mask]
        end_regime = str(cluster_rows["end_regime"].mode().iloc[0])
        composite_columns = [column for column in cluster_rows.columns if column.startswith("composite__")]
        key_columns = [column for column in cluster_rows.columns if column.startswith("series__")]
        composite_median_returns = {
            column.split("__", 1)[1]: float(cluster_rows[column].median())
            for column in composite_columns
        }
        key_series_returns = {
            column.split("__", 1)[1]: float(cluster_rows[column].median())
            for column in key_columns
        }
        entry = {
            "probability": probability,
            "end_regime": end_regime,
            "composite_median_returns": composite_median_returns,
            "key_series_returns": key_series_returns
        }
        entry["label"] = label_archetype(entry)
        archetypes.append(entry)
    archetypes.sort(key=lambda item: item["probability"], reverse=True)
    return archetypes


def simulate_paths(input_payload, return_frame, factor_payload, labels, posterior, regime_models, duration_models, leave_probabilities, profile, regime_labels):
    rng = np.random.default_rng(int(input_payload.get("seed", 42)))
    horizons = as_sorted_unique(input_payload.get("horizons", [5, 21, 63, 126]))
    max_horizon = max(horizons)
    path_count = int(input_payload.get("paths", 500000))
    batch_size = int(min(50_000, max(10_000, path_count // 10)))

    all_series = list(return_frame.columns)
    series_index = {series_id: index for index, series_id in enumerate(all_series)}
    simulate_series = [series["id"] for series in input_payload["series"] if series["simulate"] and series["id"] in series_index]
    if not simulate_series:
        raise RuntimeError("No simulate=true market series were available for path generation.")
    simulate_indices = [series_index[series_id] for series_id in simulate_series]

    pca_components = factor_payload["pca"].components_
    global_std = factor_payload["global_std"].loc[all_series].values
    residual_df = max(5.0, float(np.median([model["df"] for model in regime_models])))

    horizon_storage = {
        horizon: np.empty((path_count, len(simulate_indices)), dtype=np.float32)
        for horizon in horizons
    }
    horizon_regimes = {
        horizon: np.empty(path_count, dtype=np.int16)
        for horizon in horizons
    }

    main_horizon = max_horizon
    checkpoint_days = sorted({max(1, round(main_horizon / 3)), max(1, round((main_horizon * 2) / 3)), main_horizon})
    sample_count = min(5000, path_count)
    sample_indices = np.sort(rng.choice(path_count, size=sample_count, replace=False))
    sample_composites = pd.DataFrame(index=np.arange(sample_count))
    sample_key_series = pd.DataFrame(index=np.arange(sample_count))
    sample_end_regime = pd.Series(index=np.arange(sample_count), dtype="object")

    start_probabilities = posterior / posterior.sum()
    current_label_index = int(np.argmax(posterior))
    current_run_length = 0
    for label in reversed(labels.tolist()):
        if int(label) == current_label_index:
            current_run_length += 1
        else:
            break

    composite_map = {key: (value.get("members") or []) for key, value in (profile.get("composites") or {}).items()}
    key_series = simulate_series[: min(6, len(simulate_series))]

    for batch_start in range(0, path_count, batch_size):
        batch_end = min(path_count, batch_start + batch_size)
        batch_rows = batch_end - batch_start
        regimes = rng.choice(len(regime_models), size=batch_rows, p=start_probabilities)
        durations = np.where(regimes == current_label_index, current_run_length, 1).astype(int)
        cumulative = np.ones((batch_rows, len(simulate_indices)), dtype=np.float64)

        sample_positions = np.where((sample_indices >= batch_start) & (sample_indices < batch_end))[0]
        local_sample_rows = sample_indices[sample_positions] - batch_start

        for day in range(1, max_horizon + 1):
            batch_returns = np.zeros((batch_rows, len(all_series)), dtype=np.float64)
            for regime_id in range(len(regime_models)):
                member_rows = np.where(regimes == regime_id)[0]
                if member_rows.size == 0:
                    continue
                model = regime_models[regime_id]
                factor_draws = multivariate_t(
                    model["factor_mean"],
                    model["factor_cov"],
                    model["df"],
                    member_rows.size,
                    rng
                )
                residual_draws = rng.standard_t(residual_df, size=(member_rows.size, len(all_series))) * model["residual_std"]
                z_scores = factor_draws @ pca_components + residual_draws
                raw_returns = np.clip(z_scores * global_std, -0.25, 0.25)
                batch_returns[member_rows, :] = raw_returns

            cumulative *= 1.0 + batch_returns[:, simulate_indices]

            if day in horizons:
                horizon_storage[day][batch_start:batch_end, :] = (cumulative - 1.0).astype(np.float32)
                horizon_regimes[day][batch_start:batch_end] = regimes.astype(np.int16)

            if sample_positions.size and day in checkpoint_days:
                sample_slice = cumulative[local_sample_rows, :] - 1.0
                for composite_id, members in composite_map.items():
                    sample_composites.loc[sample_positions, f"{day}__{composite_id}"] = composite_from_returns(
                        sample_slice,
                        members,
                        {series_id: index for index, series_id in enumerate(simulate_series)}
                    )
                for series_id in key_series:
                    sample_key_series.loc[sample_positions, f"{day}__{series_id}"] = sample_slice[:, simulate_series.index(series_id)]
                if day == main_horizon:
                    sample_end_regime.loc[sample_positions] = [regime_labels[int(value)] for value in regimes[local_sample_rows]]

            if day == max_horizon:
                continue

            for regime_id in range(len(regime_models)):
                member_rows = np.where(regimes == regime_id)[0]
                if member_rows.size == 0:
                    continue
                stay_probabilities = np.array([stay_probability(int(duration), duration_models[regime_id]) for duration in durations[member_rows]])
                leaving = rng.random(member_rows.size) > stay_probabilities
                if leaving.any():
                    destinations = leave_probabilities[regime_id]
                    next_regimes = rng.choice(len(regime_models), size=int(leaving.sum()), p=destinations)
                    regimes[member_rows[leaving]] = next_regimes
                    durations[member_rows[leaving]] = 1
                staying_rows = member_rows[~leaving]
                if staying_rows.size:
                    durations[staying_rows] += 1

    summary = {"horizons": {}, "archetypes": []}
    sample_metadata = pd.DataFrame(index=np.arange(sample_count))
    for column in sample_composites.columns:
        if column.startswith(f"{main_horizon}__"):
            sample_metadata[f"composite__{column.split('__', 1)[1]}"] = sample_composites[column].astype(float)
    for series_id in key_series:
        sample_metadata[f"series__{series_id}"] = sample_key_series[f"{main_horizon}__{series_id}"].astype(float)
    sample_metadata["end_regime"] = sample_end_regime

    for horizon in horizons:
        values = horizon_storage[horizon].astype(np.float64)
        regime_counter = Counter(horizon_regimes[horizon].tolist())
        series_stats = {}
        for series_id, column_index in zip(simulate_series, range(values.shape[1])):
            bucket = values[:, column_index]
            series_stats[series_id] = {
                "mean_return_pct": float(np.mean(bucket) * 100.0),
                "median_return_pct": float(np.median(bucket) * 100.0),
                "prob_up": float(np.mean(bucket > 0)),
                "p05_return_pct": float(np.quantile(bucket, 0.05) * 100.0),
                "p10_return_pct": float(np.quantile(bucket, 0.10) * 100.0),
                "p90_return_pct": float(np.quantile(bucket, 0.90) * 100.0),
                "p95_return_pct": float(np.quantile(bucket, 0.95) * 100.0),
                "expected_shortfall_05_pct": float(bucket[bucket <= np.quantile(bucket, 0.05)].mean() * 100.0)
                if np.any(bucket <= np.quantile(bucket, 0.05))
                else 0.0
            }

        composite_stats = {}
        composite_index = {series_id: index for index, series_id in enumerate(simulate_series)}
        for composite_id, members in composite_map.items():
            available = [composite_index[member] for member in members if member in composite_index]
            if not available:
                continue
            bucket = values[:, available].mean(axis=1)
            composite_stats[composite_id] = {
                "mean_return_pct": float(np.mean(bucket) * 100.0),
                "median_return_pct": float(np.median(bucket) * 100.0),
                "prob_up": float(np.mean(bucket > 0))
            }

        summary["horizons"][str(horizon)] = {
            "series": series_stats,
            "composites": composite_stats,
            "regime_probabilities": {
                regime_labels[regime_id]: float(count / path_count)
                for regime_id, count in sorted(regime_counter.items())
            }
        }

    summary["archetypes"] = extract_archetypes(
        sample_metadata.drop(columns=["end_regime"]).fillna(0.0).values,
        sample_metadata.fillna(0.0),
        int(profile.get("archetype_count", 10)),
        rng
    )
    summary["paths"] = path_count
    summary["simulate_series"] = simulate_series
    return summary


def transmission_map(pca, series_columns, profile):
    composite_members = [member for composite in (profile.get("composites") or {}).values() for member in (composite.get("members") or [])]
    focus = set(composite_members or series_columns)
    transmission = []
    for factor_index, variance in enumerate(pca.explained_variance_ratio_):
        loadings = [
            {"series": series_id, "loading": float(loading)}
            for series_id, loading in zip(series_columns, pca.components_[factor_index])
            if series_id in focus
        ]
        positives = sorted(loadings, key=lambda entry: entry["loading"], reverse=True)[:4]
        negatives = sorted(loadings, key=lambda entry: entry["loading"])[:4]
        if positives and abs(positives[0]["loading"]) > 0.35 and positives[0]["series"] in {"SMH", "SOXX", "QQQ", "EWJ", "EWY", "EWT"}:
            label = "Hardware and regional equity leadership"
        elif positives and positives[0]["series"] in {"TLT", "IEF", "SHY"}:
            label = "Duration and rates sensitivity"
        elif positives and positives[0]["series"] in {"USO", "XLE", "GLD"}:
            label = "Commodity and inflation pressure"
        else:
            label = f"Transmission factor {factor_index + 1}"
        transmission.append(
            {
                "label": label,
                "explained_variance": float(variance),
                "positive_loadings": positives,
                "negative_loadings": negatives
            }
        )
    return transmission


def main():
    parser = argparse.ArgumentParser(description="Run the Cato probability engine.")
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    payload = load_payload(args.input)
    profile = payload["profile"]
    series_frame, meta, missing_series = build_value_frame(payload["series"])
    return_frame = build_return_frame(series_frame, meta)
    factor_payload = build_factor_model(return_frame)
    features = build_feature_matrix(factor_payload["factors"])

    aligned_returns = return_frame.loc[features.index]
    aligned_residuals = factor_payload["residuals"].loc[features.index]
    aligned_factors = factor_payload["factors"].loc[features.index]
    composite_frame = build_composite_frame(aligned_returns, profile)

    regime_payload = choose_regime_model(features, profile.get("regime_count") or {}, int(payload.get("seed", 42)))
    mapping = regime_order(regime_payload["labels"], composite_frame)
    labels, probabilities = relabel_regimes(regime_payload["labels"], regime_payload["probabilities"], mapping)
    regime_count = regime_payload["selected_regimes"]

    duration_models, leave_probabilities = build_duration_models(labels, regime_count)
    regime_stats = regime_mean_map(aligned_returns, composite_frame, labels, regime_count)
    regime_labels = [
        label_regime(profile.get("id", ""), regime_stats[regime_id]["composites_mean"], regime_id)
        for regime_id in range(regime_count)
    ]
    regime_models = build_regime_models(aligned_factors, aligned_residuals, aligned_returns, labels, regime_count)

    latest_posterior = probabilities[-1]
    adjusted_posterior, overlay_strength = overlay_adjustments(payload.get("overlay") or {}, list(aligned_returns.columns), regime_models, latest_posterior)
    current_regime_id = int(np.argmax(adjusted_posterior))
    current_run_days = 0
    for label in reversed(labels.tolist()):
        if int(label) == current_regime_id:
            current_run_days += 1
        else:
            break

    simulation = simulate_paths(
        payload,
        aligned_returns,
        factor_payload,
        labels,
        adjusted_posterior,
        regime_models,
        duration_models,
        leave_probabilities,
        profile,
        regime_labels
    )

    regimes = []
    for regime_id in range(regime_count):
        regimes.append(
            {
                "id": regime_id,
                "label": regime_labels[regime_id],
                "probability_now": float(adjusted_posterior[regime_id]),
                "median_duration_days": float(duration_models[regime_id]["median_duration_days"]),
                "current_run_days": float(current_run_days if regime_id == current_regime_id else 1.0),
                "series_mean_bps": {
                    series_id: float(regime_models[regime_id]["mean_series"][column_index] * 10000.0)
                    for column_index, series_id in enumerate(aligned_returns.columns)
                },
                "composites_mean_bps": {
                    key: float(value * 10000.0)
                    for key, value in regime_stats[regime_id]["composites_mean"].items()
                }
            }
        )

    result = {
        "topic": payload.get("topic") or profile.get("title") or profile.get("id"),
        "profile_id": profile.get("id"),
        "title": profile.get("title"),
        "as_of_date": str(aligned_returns.index[-1].date()),
        "paths": int(payload.get("paths", 500000)),
        "horizons_requested": as_sorted_unique(payload.get("horizons", [5, 21, 63, 126])),
        "current_regime": {
            "id": current_regime_id,
            "label": regime_labels[current_regime_id],
            "probability": float(adjusted_posterior[current_regime_id]),
            "current_run_days": float(current_run_days)
        },
        "regimes": regimes,
        "horizons": simulation["horizons"],
        "archetypes": simulation["archetypes"],
        "transmission": transmission_map(factor_payload["pca"], list(aligned_returns.columns), profile),
        "diagnostics": {
            "history_days": int(aligned_returns.shape[0]),
            "series_count": int(aligned_returns.shape[1]),
            "factor_count": int(factor_payload["pca"].n_components_),
            "selected_regime_count": int(regime_count),
            "missing_series": missing_series,
            "bic_scores": regime_payload["bic_scores"],
            "overlay_strength": overlay_strength
        }
    }
    write_payload(args.output, result)


if __name__ == "__main__":
    main()
