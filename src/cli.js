const path = require("node:path");
const { askQuestion } = require("./ask");
const { compileProject } = require("./compile");
const { writeDeck } = require("./deck");
const { runDoctor } = require("./doctor");
const { ingest } = require("./ingest");
const { initProject } = require("./init");
const { lintProject } = require("./lint");
const { createPostmortem } = require("./postmortem");
const { writePrinciplesSnapshot } = require("./principles");
const { writeReflection } = require("./reflect");
const { captureResearch } = require("./research-handoff");
const { writeReport } = require("./report");
const { searchCorpus } = require("./search");
const { selfIngest } = require("./self-ingest");
const { writeSurveillance } = require("./surveil");
const {
  createWatchProfile,
  formatWatchProfileLine,
  listActiveWatchProfiles,
  resolveWatchSubject,
  writeWatchRefreshReport
} = require("./watch");

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

function printHelp() {
  console.log(`
Cato_WisdomEngine CLI

Usage:
  .\\cato.cmd init
  .\\cato.cmd ingest [--from inbox/drop_here] [--copy]
  .\\cato.cmd self-ingest [--from inbox/self] [--type auto|principles|heuristics|...]
  .\\cato.cmd compile [--promote-candidates]
  .\\cato.cmd search "query" [--limit 8]
  .\\cato.cmd capture-research path\\to\\bundle.json [--promote] [--no-surveil]
  .\\cato.cmd ask "question" [--limit 6] [--save-question] [--promote]
  .\\cato.cmd report "topic" [--limit 10] [--promote]
  .\\cato.cmd deck "topic" [--limit 8] [--promote]
  .\\cato.cmd surveil "topic" [--limit 10]
  .\\cato.cmd watch "topic" [--context "..."] [--aliases "..."] [--entities "..."] [--concepts "..."] [--triggers "..."]
  .\\cato.cmd watch-refresh [--topic "topic"] [--limit 10]
  .\\cato.cmd watch-list
  .\\cato.cmd reflect [--promote]
  .\\cato.cmd principles
  .\\cato.cmd postmortem "title" [--notes "..."] [--from file]
  .\\cato.cmd doctor
  .\\cato.cmd lint

Options:
  --root PATH           Use a different project root.
  --copy                Keep the original file in inbox after ingest.
  --save-question       Also create a question page in wiki/questions.
  --promote-candidates  Promote repeated candidate concepts into concept pages.
  --promote             File the generated output back into wiki/synthesis.
  --no-surveil          Skip surveillance refresh during capture-research even if the bundle includes watch data.
  --no-refresh          Create/update the watch profile without refreshing surveillance.
`);
}

function printSearchResults(results) {
  if (!results.length) {
    console.log("No matches found.");
    return;
  }

  for (const [index, result] of results.entries()) {
    console.log(`${index + 1}. [${result.score}] ${result.title}`);
    console.log(`   ${result.relativePath}`);
    if (result.excerpt) {
      console.log(`   ${result.excerpt}`);
    }
  }
}

function printWatchProfiles(profiles) {
  if (!profiles.length) {
    console.log("No active watch profiles.");
    return;
  }

  for (const [index, profile] of profiles.entries()) {
    console.log(`${index + 1}. ${formatWatchProfileLine(profile)}`);
    console.log(`   ${profile.relativePath}`);
  }
}

function runCli(argv) {
  const parsed = parseArgs(argv);
  const root = path.resolve(parsed.options.root || process.cwd());

  switch (parsed.command) {
    case "help":
      printHelp();
      return;
    case "init": {
      const result = initProject(root);
      console.log(`Initialised project structure in ${root}`);
      console.log(`Compiled indices: ${JSON.stringify(result.compileResult)}`);
      return;
    }
    case "ingest": {
      const result = ingest(root, parsed.options);
      console.log(`Ingested ${result.ingested} file(s).`);
      return;
    }
    case "self-ingest": {
      const result = selfIngest(root, parsed.options);
      console.log(`Ingested ${result.ingested} self-note(s).`);
      return;
    }
    case "compile": {
      const result = compileProject(root, {
        promoteCandidates: Boolean(parsed.options["promote-candidates"])
      });
      console.log(
        `Compiled source notes=${result.sourceNotes}, concepts=${result.concepts}, entities=${result.entities}, timelines=${result.timelines}, contradiction_candidates=${result.contradictionCandidates}`
      );
      return;
    }
    case "search": {
      const query = parsed.positionals.join(" ").trim();
      if (!query) {
        throw new Error('Search requires a query. Example: .\\cato.cmd search "market structure"');
      }
      const results = searchCorpus(root, query, { limit: parsed.options.limit || 8 });
      printSearchResults(results);
      return;
    }
    case "capture-research": {
      const bundlePath = parsed.positionals.join(" ").trim();
      if (!bundlePath) {
        throw new Error('Capture-research requires a bundle path. Example: .\\cato.cmd capture-research .\\commands\\research-capture.example.json');
      }
      const result = captureResearch(root, bundlePath, {
        promote: Boolean(parsed.options.promote),
        noSurveil: Boolean(parsed.options["no-surveil"])
      });
      console.log(`Captured sources staged: ${result.stagedSources.length}`);
      console.log(`Captured sources ingested: ${result.ingested}`);
      console.log(`Handoff inbox: ${result.handoffDir}`);
      if (result.outputResult) {
        console.log(`Wrote output to ${result.outputResult.outputPath}`);
        if (result.outputResult.promotedPath) {
          console.log(`Promoted synthesis note to ${result.outputResult.promotedPath}`);
        }
      }
      if (result.watch?.surveillance?.notePath) {
        console.log(`Updated surveillance page at ${result.watch.surveillance.notePath}`);
      }
      if (result.failures.length) {
        console.log(`Capture failures: ${result.failures.length}`);
      }
      return;
    }
    case "ask": {
      const question = parsed.positionals.join(" ").trim();
      if (!question) {
        throw new Error('Ask requires a question. Example: .\\cato.cmd ask "What are the key drivers of X?"');
      }
      const result = askQuestion(root, question, {
        limit: parsed.options.limit,
        saveQuestion: Boolean(parsed.options["save-question"]),
        promote: Boolean(parsed.options.promote)
      });
      console.log(`Wrote memo to ${result.outputPath}`);
      if (result.promotedPath) {
        console.log(`Promoted synthesis note to ${result.promotedPath}`);
      }
      printSearchResults(result.results);
      return;
    }
    case "report": {
      const topic = parsed.positionals.join(" ").trim();
      if (!topic) {
        throw new Error('Report requires a topic. Example: .\\cato.cmd report "Passive flows and liquidity"');
      }
      const result = writeReport(root, topic, {
        limit: parsed.options.limit,
        promote: Boolean(parsed.options.promote)
      });
      console.log(`Wrote report to ${result.outputPath}`);
      if (result.promotedPath) {
        console.log(`Promoted synthesis note to ${result.promotedPath}`);
      }
      printSearchResults(result.results);
      return;
    }
    case "deck": {
      const topic = parsed.positionals.join(" ").trim();
      if (!topic) {
        throw new Error('Deck requires a topic. Example: .\\cato.cmd deck "AI capex and market structure"');
      }
      const result = writeDeck(root, topic, {
        limit: parsed.options.limit,
        promote: Boolean(parsed.options.promote)
      });
      console.log(`Wrote deck to ${result.outputPath}`);
      if (result.promotedPath) {
        console.log(`Promoted synthesis note to ${result.promotedPath}`);
      }
      return;
    }
    case "surveil": {
      const subject = parsed.positionals.join(" ").trim();
      if (!subject) {
        throw new Error('Surveil requires a subject. Example: .\\cato.cmd surveil "Passive flows"');
      }
      const result = writeSurveillance(root, subject, {
        limit: parsed.options.limit
      });
      console.log(`Updated surveillance page at ${result.notePath}`);
      printSearchResults(result.results);
      return;
    }
    case "watch": {
      const subject = parsed.positionals.join(" ").trim();
      if (!subject) {
        throw new Error('Watch requires a subject. Example: .\\cato.cmd watch "Middle East" --context "Track escalation risk for the defensive fund."');
      }
      const watchResult = createWatchProfile(root, subject, {
        context: parsed.options.context,
        aliases: parsed.options.aliases,
        entities: parsed.options.entities,
        concepts: parsed.options.concepts,
        triggers: parsed.options.triggers,
        instructions: parsed.options.instructions,
        priority: parsed.options.priority,
        cadence: parsed.options.cadence,
        status: parsed.options.status
      });
      console.log(`Updated watch profile at ${watchResult.profilePath}`);
      console.log(`Updated watch ontology at ${watchResult.ontologyPath}`);
      if (!parsed.options["no-refresh"]) {
        const result = writeSurveillance(root, subject, {
          limit: parsed.options.limit
        });
        console.log(`Updated surveillance page at ${result.notePath}`);
        printSearchResults(result.results);
      }
      return;
    }
    case "watch-refresh": {
      const topic = parsed.options.topic || parsed.positionals.join(" ").trim();
      const profiles = topic
        ? (() => {
            const resolved = resolveWatchSubject(root, topic);
            return resolved.profile ? [resolved.profile] : [];
          })()
        : listActiveWatchProfiles(root);
      if (!profiles.length) {
        console.log("No matching active watch profiles.");
        return;
      }
      const refreshed = [];
      for (const profile of profiles) {
        const result = writeSurveillance(root, profile.title, {
          limit: parsed.options.limit
        });
        refreshed.push({
          subject: profile.title,
          profilePath: profile.relativePath,
          notePath: result.notePath,
          resultsCount: result.results.length
        });
      }
      const reportPath = writeWatchRefreshReport(root, refreshed);
      console.log(`Refreshed ${refreshed.length} watch profile(s).`);
      console.log(`Refresh report: ${reportPath}`);
      return;
    }
    case "watch-list": {
      const profiles = listActiveWatchProfiles(root);
      printWatchProfiles(profiles);
      return;
    }
    case "reflect": {
      const result = writeReflection(root, {
        promote: Boolean(parsed.options.promote)
      });
      console.log(`Wrote reflection memo to ${result.outputPath}`);
      console.log(`Updated tension register at ${result.tensionRegisterPath}`);
      if (result.promotedPath) {
        console.log(`Promoted synthesis note to ${result.promotedPath}`);
      }
      return;
    }
    case "principles": {
      const result = writePrinciplesSnapshot(root);
      console.log(`Wrote principles snapshot to ${result.outputPath}`);
      console.log(`Self-notes scanned: ${result.selfNotes}`);
      return;
    }
    case "postmortem": {
      const title = parsed.positionals.join(" ").trim();
      if (!title) {
        throw new Error('Postmortem requires a title. Example: .\\cato.cmd postmortem "Q1 satellite ETF review"');
      }
      const result = createPostmortem(root, title, {
        notes: parsed.options.notes,
        from: parsed.options.from,
        confidence: parsed.options.confidence
      });
      console.log(`Created postmortem note at ${result.notePath}`);
      return;
    }
    case "doctor": {
      const result = runDoctor(root);
      console.log(`Doctor report: ${result.reportPath}`);
      console.log(`Issues found: ${result.issues.length}`);
      console.log(`Lint issues snapshot: ${result.lintIssues}`);
      return;
    }
    case "lint": {
      const result = lintProject(root);
      console.log(`Lint report: ${result.reportPath}`);
      console.log(`Issues found: ${result.issues.length}`);
      return;
    }
    default:
      throw new Error(`Unknown command: ${parsed.command}`);
  }
}

module.exports = {
  runCli
};
