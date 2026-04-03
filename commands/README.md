# Commands

This folder now contains simple Windows launchers for the most common Cato operations. They are thin wrappers over `.\cato.cmd` plus optional Obsidian opening.

## Included Launchers

- `Open-Cato-Vault.cmd` = open the repo root in Obsidian
- `Refresh-Cato.cmd` = run `ingest`, `self-ingest`, and `compile --promote-candidates`, then open the home map
- `Write-Report.cmd` = ask for a topic, run `compile`, write a report, and open the newest report
- `Ask-Cato.cmd` = ask for a question, run `compile`, write a memo, and open the newest memo
- `Write-Deck.cmd` = ask for a topic, run `compile`, write a deck, and open the newest deck
- `Run-Surveillance.cmd` = ask for a subject, run `compile`, refresh the surveillance page, and open it
- `Create-Watch.cmd` = ask for a watch subject and context, create/update the watch profile, refresh surveillance, and open it
- `Refresh-Watches.cmd` = refresh all active watch profiles and open the refresh report
- `Import-Research-Bundle.cmd` = import a GPT/Codex research bundle so its cited sources and authored output become durable Cato artefacts
- `Prepare-Frontier-Pack.cmd` = refresh claim/state/decision scaffolding and generate a Codex-ready frontier pack plus starter capture bundle
- `Import-Frontier-Bundle.cmd` = capture a Codex-authored frontier bundle back into Cato
- `Run-Reflect.cmd` = refresh the self-reflection memo and open it
- `Run-Doctor.cmd` = run repo health checks and open the latest doctor report
- `Open-Latest-Report.cmd` = open the newest report without generating a new one
- `Run-Claims.cmd` = rebuild the claim ledger, snapshot it, and open the claim index
- `Refresh-State.cmd` = ask for a subject, refresh the state page, and open it
- `Write-Regime-Brief.cmd` = refresh the default regime brief and open the newest brief
- `Write-Decision-Note.cmd` = ask for a topic, refresh the decision note, and open it
- `Write-Meeting-Brief.cmd` = ask for a title, write a meeting brief, and open it
- `Run-Red-Team.cmd` = ask for a topic, write a red-team brief, and open it
- `Run-Market-Changes.cmd` = write the current market-change brief and open it

## Shared Script

- `Cato-Launcher.ps1` = central PowerShell implementation used by the `.cmd` wrappers

## Research Bundle Reference

- `research-capture.example.json` = example GPT/Codex handoff bundle for `capture-research`
- `frontier-capture.example.json` = example Codex frontier handoff bundle for `capture-frontier`

## Notes

- These are operator conveniences, not a second runtime.
- `report`, `deck`, and `reflect` promote their outputs by default through the launcher.
- `ask` saves a question page by default through the launcher.
- Obsidian opening uses the `obsidian://open?path=` URI and falls back to the file path if needed.
