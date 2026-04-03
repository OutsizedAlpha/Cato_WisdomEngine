#!/usr/bin/env node

const { runCli } = require("../src/cli");

try {
  runCli(process.argv.slice(2));
} catch (error) {
  console.error(error.message || error);
  process.exitCode = 1;
}
