# Commands

This folder contains thin Windows launchers for the most common Cato operating motions. They are conveniences over `.\cato.cmd`, not a second runtime.

## What The Launcher Layer Is For

Use these wrappers when the action is frequent enough that typing the command becomes friction.

Good launcher candidates:

- refreshing the corpus
- preparing a report pack or writing a memo
- refreshing surveillance
- rebuilding claims
- refreshing a state page
- writing a regime or meeting brief
- writing a decision note or red-team brief
- opening the latest artefact
- checking repo health

Do not add launchers for everything just because you can.

## Included Launchers

Workspace and refresh:

- `Open-Cato-Vault.cmd`
- `Refresh-Cato.cmd`
- `Open-Latest-Report.cmd`

Grounded outputs:

- `Ask-Cato.cmd`
- `Write-Report.cmd`
- `Write-Deck.cmd`

Monitoring and research:

- `Run-Surveillance.cmd`
- `Create-Watch.cmd`
- `Refresh-Watches.cmd`
- `Import-Research-Bundle.cmd`

Belief, state, and decision:

- `Run-Claims.cmd`
- `Refresh-State.cmd`
- `Write-Regime-Brief.cmd`
- `Write-Decision-Note.cmd`
- `Write-Meeting-Brief.cmd`
- `Run-Red-Team.cmd`
- `Run-Market-Changes.cmd`

Frontier handoff:

- `Prepare-Frontier-Pack.cmd`
- `Import-Frontier-Bundle.cmd`

PDF vision handoff:

- use `.\cato.cmd pdf-pack` to prepare a rendered-page PDF review pack
- use `.\cato.cmd capture-pdf` to import the authored extraction bundle back into Cato

Self-model and health:

- `Run-Reflect.cmd`
- `Run-Doctor.cmd`

## Shared Script

- `Cato-Launcher.ps1`

This is the central PowerShell implementation used by the `.cmd` wrappers.

## Bundle References

- `research-capture.example.json` = example bundle for `capture-research`
- `frontier-capture.example.json` = example bundle for `capture-frontier`
- `pdf-capture.example.json` = example bundle for `capture-pdf`

## Notes

- Launchers are operator shortcuts, not business logic.
- The actual behavior lives in the Node CLI.
- The launcher layer assumes the settled operating model:
  - Cato handles deterministic plumbing and durable storage
  - Codex/GPT handles live reasoning and authored synthesis
- `Write-Report.cmd` now prepares the latest report pack prompt under `cache/report-packs/`; the canonical final report is only created after the authored bundle is captured with `capture-report`.
- `Open-Latest-Report.cmd` now opens the latest canonical report under `wiki/reports/`, not legacy timestamped drafts under `outputs/reports/`.
- For the deeper workflow explanation, read `docs/operator_guide.md`.
