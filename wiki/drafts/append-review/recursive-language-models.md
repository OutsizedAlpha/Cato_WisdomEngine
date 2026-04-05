---
id: DRAFT-2026-RECURSIVE-LA
kind: draft-note
title: "Append And Review: Recursive Language Models"
status: open
stage: append-review
source_note_path: wiki/source-notes/recursive-language-models.md
raw_path: raw/pdfs/SRC-2026-B3B874052EE5__251224601v2_260316_090644.pdf
metadata_path: extracted/metadata/SRC-2026-B3B874052EE5.json
document_class: research_note
created_at: 2026-04-05T18:10:02.646Z
---

# Append And Review: Recursive Language Models

## Working Capture

Recursive Language Models Alex L. Zhang1 Tim Kraska1 Omar Khattab1 Abstract 100 We study allowing large language models (LLMs) to process arbitrarily long prompts through the 80 lens of inference-time scaling. We propose Re- 60 cursive Language Models (RLMs), a general 40 inference paradigm that treats long prompts as part of an external environment and allows the 20 LLM to programmatically examine, decompose, 0 and…

## Document Route

- Document class: `research_note`
- Review lens: Check methodology, sample limits, and whether the argument travels outside the paper's frame.
- Source note: `wiki/source-notes/recursive-language-models.md`
- Raw path: `raw/pdfs/SRC-2026-B3B874052EE5__251224601v2_260316_090644.pdf`

## Review Checklist

- [ ] Verify the extracted summary against the raw source before promoting any durable claim.
- [ ] Link the source to the right concepts, entities, or watch subjects.
- [ ] Write down the strongest counter-reading, not just the base-case interpretation.
- [ ] Capture methodology, sample limits, and the conditions under which the result would fail.

## Candidate Concepts

- language models
- recursive language
- recursive language models
- user id
- one instance
- final answer
- qwen3 coder
- numeric value

## Candidate Tags

- No initial tags captured.

## Working Counter-Read

- What is the strongest reasonable alternative interpretation of this source?
- Which part of the current summary is likely to be overconfident or incomplete?

## Open Questions

- What would have to be verified before this source informs claims, states, or decisions?
- Which opposing or primary sources should be paired with this one?

## Raw Extraction Snapshot

Recursive Language Models Alex L. Zhang1 Tim Kraska1 Omar Khattab1 Abstract 100 We study allowing large language models (LLMs) to process arbitrarily long prompts through the 80 lens of inference-time scaling. We propose Re- 60 cursive Language Models (RLMs), a general 40 inference paradigm that treats long prompts as part of an external environment and allows the 20 LLM to programmatically examine, decompose, 0 and recursively call itself over snippets of the 8k 16k 33k 66k 131k 262k 524k 1 M prompt. We find that RLMs can successfully process inputs up to two orders of magnitude beyond model context windows and, even for shorter prompts, dramatically outperform the quality of vanilla frontier LLMs and common long-context scaffolds across four diverse long- context tasks while having comparable cost. At a small scale, we post-train the first natively recursive language model. Our model, RLM- Qwen3-8B, outperforms the underlying Qwen3- 8B model by 28.3% on average and even ap- proaches the quality of vanilla GPT-5 on three long-context tasks. Code is available at https: //github.com/alexzhang13/rlm. 1. Introduction Frontier reasoning models have limited context windows and, even within their limits, tend to exhibit context rot (Hong et al., 2025), a phenomenon illustrated in Fig- ure 1 where quality degrades steeply as prompts get longer. Though we expect context lengths to ste…

## Provenance

- Metadata path: `extracted/metadata/SRC-2026-B3B874052EE5.json`
- Extraction status: `extracted`
- Extraction method: `llm_vision_handoff`
- Preserve this draft note as append-and-review workspace, not as settled knowledge.
