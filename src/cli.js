const path = require("node:path");
const { askQuestion } = require("./ask");
const { diffLatestClaimSnapshots, refreshClaims, writeWhyBelieve } = require("./claims");
const { compileProject } = require("./compile");
const { writeDecisionNote, writeMeetingBrief, writeRedTeam, writeWhatChangedForMarkets } = require("./decisions");
const { writeDeck } = require("./deck");
const { runDoctor } = require("./doctor");
const { captureFrontier, writeFrontierPack } = require("./frontier");
const { ingest } = require("./ingest");
const { initProject } = require("./init");
const { lintProject } = require("./lint");
const { capturePdf, writePdfPack } = require("./pdf-handoff");
const { createPostmortem } = require("./postmortem");
const { writePrinciplesSnapshot } = require("./principles");
const { writeReflection } = require("./reflect");
const { captureResearch } = require("./research-handoff");
const { captureReport, writeReport } = require("./report");
const { searchCorpus } = require("./search");
const { selfIngest } = require("./self-ingest");
const { refreshState, writeRegimeBrief, writeStateDiff } = require("./states");
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
  .\\cato.cmd pdf-pack [--from inbox/drop_here] [--limit 8] [--dpi 144] [--max-pages 0]
  .\\cato.cmd self-ingest [--from inbox/self] [--type auto|principles|heuristics|...]
  .\\cato.cmd compile [--promote-candidates]
  .\\cato.cmd search "query" [--limit 8]
  .\\cato.cmd capture-research path\\to\\bundle.json [--promote] [--no-surveil]
  .\\cato.cmd frontier-pack "topic" [--mode decision|belief|state|meeting] [--kind report|brief|meeting-brief|deck] [--subjects "Global Macro,Geopolitical Risk"]
  .\\cato.cmd capture-frontier path\\to\\bundle.json [--promote] [--no-surveil]
  .\\cato.cmd capture-pdf path\\to\\bundle.json [--copy] [--promote-candidates]
  .\\cato.cmd ask "question" [--limit 6] [--save-question] [--promote]
  .\\cato.cmd report "topic" [--limit 10]
  .\\cato.cmd capture-report path\\to\\bundle.json
  .\\cato.cmd deck "topic" [--limit 8] [--promote]
  .\\cato.cmd surveil "topic" [--limit 10]
  .\\cato.cmd watch "topic" [--context "..."] [--aliases "..."] [--entities "..."] [--concepts "..."] [--triggers "..."]
  .\\cato.cmd watch-refresh [--topic "topic"] [--limit 10]
  .\\cato.cmd watch-list
  .\\cato.cmd claims-refresh [--snapshot]
  .\\cato.cmd claim-diff [--topic "topic"]
  .\\cato.cmd why-believe "topic" [--limit 10]
  .\\cato.cmd state-refresh "subject" [--claim-limit 12] [--evidence-limit 8]
  .\\cato.cmd state-diff "subject"
  .\\cato.cmd regime-brief [--set weekly-investment-meeting] [--subjects "Global Macro,US Inflation"]
  .\\cato.cmd meeting-brief "title" [--subjects "Global Macro,US Inflation"]
  .\\cato.cmd decision-note "topic"
  .\\cato.cmd red-team "topic"
  .\\cato.cmd what-changed-for-markets [--subjects "Global Macro,Geopolitical Risk"]
  .\\cato.cmd reflect [--promote]
  .\\cato.cmd principles
  .\\cato.cmd postmortem "title" [--notes "..."] [--from file]
  .\\cato.cmd doctor
  .\\cato.cmd lint

Options:
  --root PATH           Use a different project root.
  --copy                Keep the original file in inbox after ingest.
  --dpi N               Render PDF pack page images at this DPI. Default: 144.
  --max-pages N         Limit rendered pages per PDF pack document. Default: 0 = all pages.
  --save-question       Also create a question page in wiki/questions.
  --promote-candidates  Promote repeated candidate concepts into concept pages.
  --promote             File the generated output back into wiki/synthesis.
  --no-surveil          Skip surveillance refresh during capture-research or capture-frontier even if the bundle includes watch data.
  --no-refresh          Create/update the watch profile without refreshing surveillance.
  --snapshot            Write a timestamped claim snapshot during claims-refresh.
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
    case "pdf-pack": {
      const result = writePdfPack(root, parsed.options);
      console.log(`Prepared PDF vision pack for ${result.documents} document(s).`);
      console.log(`Pack manifest: ${result.packPath}`);
      console.log(`Prompt: ${result.promptPath}`);
      console.log(`Capture bundle: ${result.capturePath}`);
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
    case "frontier-pack": {
      const seed = parsed.positionals.join(" ").trim() || parsed.options.title || "";
      if (!seed) {
        throw new Error('Frontier-pack requires a topic or title. Example: .\\cato.cmd frontier-pack "Global Macro" --mode decision');
      }
      const result = writeFrontierPack(root, seed, {
        mode: parsed.options.mode,
        kind: parsed.options.kind,
        title: parsed.options.title,
        subjects: parsed.options.subjects,
        question: parsed.options.question,
        set: parsed.options.set,
        regimeTitle: parsed.options["regime-title"],
        marketChangesTitle: parsed.options["market-title"],
        claimLimit: parsed.options["claim-limit"],
        evidenceLimit: parsed.options["evidence-limit"]
      });
      console.log(`Frontier pack: ${result.packPath}`);
      console.log(`Prompt: ${result.promptPath}`);
      console.log(`Capture bundle: ${result.capturePath}`);
      console.log(`Local sources: ${result.localSources}`);
      console.log(`Claims: ${result.claims}, Evidence: ${result.evidence}`);
      return;
    }
    case "capture-frontier": {
      const bundlePath = parsed.positionals.join(" ").trim();
      if (!bundlePath) {
        throw new Error('Capture-frontier requires a bundle path. Example: .\\cato.cmd capture-frontier .\\cache\\frontier-packs\\...-capture.json');
      }
      const result = captureFrontier(root, bundlePath, {
        promote: Boolean(parsed.options.promote),
        noSurveil: Boolean(parsed.options["no-surveil"])
      });
      console.log(`Captured frontier bundle: ${bundlePath}`);
      console.log(`Captured sources ingested: ${result.ingested}`);
      if (result.outputResult) {
        console.log(`Wrote output to ${result.outputResult.outputPath}`);
        if (result.outputResult.promotedPath) {
          console.log(`Promoted synthesis note to ${result.outputResult.promotedPath}`);
        }
      }
      return;
    }
    case "capture-pdf": {
      const bundlePath = parsed.positionals.join(" ").trim();
      if (!bundlePath) {
        throw new Error('Capture-pdf requires a bundle path. Example: .\\cato.cmd capture-pdf .\\cache\\pdf-packs\\...-capture.json');
      }
      const result = capturePdf(root, bundlePath, parsed.options);
      console.log(`PDF documents staged: ${result.staged.length}`);
      console.log(`PDF documents ingested: ${result.ingested}`);
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
        limit: parsed.options.limit
      });
      console.log(`Report pack: ${result.packPath}`);
      console.log(`Prompt: ${result.promptPath}`);
      console.log(`Capture bundle: ${result.capturePath}`);
      console.log(`Canonical final report path: ${result.canonicalPath}`);
      console.log(`Evidence results: ${result.results.length}`);
      return;
    }
    case "capture-report": {
      const bundlePath = parsed.positionals.join(" ").trim();
      if (!bundlePath) {
        throw new Error('Capture-report requires a bundle path. Example: .\\cato.cmd capture-report .\\cache\\report-packs\\...-capture.json');
      }
      const result = captureReport(root, bundlePath);
      console.log(`Captured report bundle: ${bundlePath}`);
      if (result.outputResult) {
        console.log(`Wrote canonical report to ${result.outputResult.outputPath}`);
        if (result.outputResult.archivedPath) {
          console.log(`Archived previous canonical version to ${result.outputResult.archivedPath}`);
        }
      }
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
    case "claims-refresh": {
      const result = refreshClaims(root, {
        writeSnapshot: Boolean(parsed.options.snapshot)
      });
      console.log(`Claims refreshed: ${result.claims}`);
      console.log(`Contested claims: ${result.contested}`);
      if (result.snapshotPath) {
        console.log(`Snapshot: ${result.snapshotPath}`);
      }
      if (result.diffReportPath) {
        console.log(`Diff report: ${result.diffReportPath}`);
      }
      return;
    }
    case "claim-diff": {
      const result = diffLatestClaimSnapshots(root, {
        topic: parsed.options.topic || parsed.positionals.join(" ").trim()
      });
      if (!result.reportPath) {
        console.log("Not enough claim snapshots to diff.");
        return;
      }
      console.log(`Claim diff: ${result.reportPath}`);
      console.log(`Added: ${result.added}, Removed: ${result.removed}, Contested: ${result.contested}`);
      return;
    }
    case "why-believe": {
      const topic = parsed.positionals.join(" ").trim();
      if (!topic) {
        throw new Error('Why-believe requires a topic. Example: .\\cato.cmd why-believe "US inflation"');
      }
      const result = writeWhyBelieve(root, topic, {
        limit: parsed.options.limit
      });
      console.log(`Wrote belief brief to ${result.outputPath}`);
      console.log(`Claims used: ${result.claims}`);
      console.log(`Evidence used: ${result.evidence}`);
      return;
    }
    case "state-refresh": {
      const subject = parsed.positionals.join(" ").trim();
      if (!subject) {
        throw new Error('State-refresh requires a subject. Example: .\\cato.cmd state-refresh "Global Macro"');
      }
      const result = refreshState(root, subject, {
        claimLimit: parsed.options["claim-limit"],
        evidenceLimit: parsed.options["evidence-limit"]
      });
      console.log(`Updated state page at ${result.statePath}`);
      console.log(`State label: ${result.stateLabel}`);
      console.log(`Confidence: ${result.confidence}`);
      return;
    }
    case "state-diff": {
      const subject = parsed.positionals.join(" ").trim();
      if (!subject) {
        throw new Error('State-diff requires a subject. Example: .\\cato.cmd state-diff "Global Macro"');
      }
      const result = writeStateDiff(root, subject);
      console.log(`Wrote state diff to ${result.outputPath}`);
      console.log(`Changed claims: ${result.changed}`);
      return;
    }
    case "regime-brief": {
      const result = writeRegimeBrief(root, {
        set: parsed.options.set,
        title: parsed.options.title,
        subjects: parsed.options.subjects,
        noRefresh: Boolean(parsed.options["no-refresh"]),
        claimLimit: parsed.options["claim-limit"],
        evidenceLimit: parsed.options["evidence-limit"]
      });
      console.log(`Wrote regime brief to ${result.outputPath}`);
      console.log(`Updated regime page at ${result.regimePath}`);
      return;
    }
    case "meeting-brief": {
      const title = parsed.positionals.join(" ").trim() || "Weekly investment meeting brief";
      const result = writeMeetingBrief(root, title, {
        subjects: parsed.options.subjects,
        claimLimit: parsed.options["claim-limit"],
        evidenceLimit: parsed.options["evidence-limit"]
      });
      console.log(`Wrote meeting brief to ${result.outputPath}`);
      console.log(`Subjects covered: ${result.subjects.join(", ")}`);
      return;
    }
    case "decision-note": {
      const topic = parsed.positionals.join(" ").trim();
      if (!topic) {
        throw new Error('Decision-note requires a topic. Example: .\\cato.cmd decision-note "Middle East"');
      }
      const result = writeDecisionNote(root, topic, {
        claimLimit: parsed.options["claim-limit"],
        evidenceLimit: parsed.options["evidence-limit"]
      });
      console.log(`Updated decision note at ${result.notePath}`);
      console.log(`Linked state page: ${result.statePath}`);
      return;
    }
    case "red-team": {
      const topic = parsed.positionals.join(" ").trim();
      if (!topic) {
        throw new Error('Red-team requires a topic. Example: .\\cato.cmd red-team "US inflation"');
      }
      const result = writeRedTeam(root, topic, {
        claimLimit: parsed.options["claim-limit"],
        evidenceLimit: parsed.options["evidence-limit"]
      });
      console.log(`Wrote red-team brief to ${result.outputPath}`);
      console.log(`Contested claims surfaced: ${result.contestedClaims}`);
      return;
    }
    case "what-changed-for-markets": {
      const result = writeWhatChangedForMarkets(root, {
        title: parsed.options.title,
        subjects: parsed.options.subjects,
        claimLimit: parsed.options["claim-limit"],
        evidenceLimit: parsed.options["evidence-limit"]
      });
      console.log(`Wrote market-change brief to ${result.outputPath}`);
      console.log(`Subjects covered: ${result.subjects.join(", ")}`);
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
