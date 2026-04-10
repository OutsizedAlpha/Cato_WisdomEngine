# Project Map

## Runtime

- Node-first CLI with no declared runtime or dev dependencies in `package.json`
- Python wrappers and PDF tooling remain optional environment helpers
- Browser automation is treated as an environment capability verified by `doctor`

## Entry Points

- `bin/cato.js` = CLI entry
- `src/cli.js` = argument parsing and dispatch
- `src/command-registry.js` = command contract registry

## Key Commands

- `node .\tests\cato.test.js`
- `node .\bin\cato.js help`
- `node .\bin\cato.js lint`
- `node .\bin\cato.js public-release --to ..\Cato_WisdomEngine_Public`

## Architecture Notes

- Markdown-first, file-first, and auditable by default
- Keep repo agent-driven rather than embedding external LLM execution into the CLI
- Deterministic plumbing in the CLI, model-authored substantive output through pack/capture workflows
- Public releases should preserve engine behaviour while excluding private corpus and operator-specific memory
