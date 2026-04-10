const path = require("node:path");
const { buildCommandRegistry } = require("./command-registry");

function parseArgs(argv) {
  const positionals = [];
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      options[key] = true;
    } else {
      options[key] = next;
      index += 1;
    }
  }

  return { command: positionals.shift() || "help", positionals, options };
}

function runCli(argv) {
  const parsed = parseArgs(argv);
  const root = path.resolve(parsed.options.root || process.cwd());
  const registry = buildCommandRegistry();
  const entry = registry[parsed.command];
  if (!entry) {
    throw new Error(`Unknown command: ${parsed.command}`);
  }
  entry.run(root, parsed);
}

module.exports = {
  runCli
};
