# Sensitive Data Policy

Cato now treats secret-like material as a gating condition at ingest.

## Default Rule

- If ingest detects API keys, private-key headers, bearer tokens, or similar credential patterns, it does not write the source into canonical `raw/`, `extracted/`, or `wiki/`.
- The target is quarantined under `tmp/sensitive-quarantine/` and logged for operator review.

## Override

- Use `--allow-sensitive` only when you intentionally want the source preserved in the repo despite the detection.
- Override should be rare and deliberate.
- When override is used, the resulting source note stays flagged and lint will continue surfacing it.

## Scope

The scanner currently checks:

- text and markdown sources
- extracted text generated during ingest
- common code and config files inside repo snapshots

This is a conservative guardrail, not a perfect DLP system. Review flagged items manually before promotion or sharing.
