const { captureAuthored, writeAuthoredPack } = require("./authored");
const { diffLatestClaimSnapshots, refreshClaims } = require("./claims");
const { compileProject } = require("./compile");
const { captureCrystallize, writeCrystallizePack } = require("./crystallize");
const { runDoctor } = require("./doctor");
const { captureFrontier, writeFrontierPack } = require("./frontier");
const { ingest } = require("./ingest");
const { initProject } = require("./init");
const { lintProject } = require("./lint");
const { captureMemory, handleWorkingMemoryAfterCommand, writeMemoryRefreshPack, workingMemoryStatus } = require("./memory");
const { capturePdf, writePdfPack } = require("./pdf-handoff");
const { buildPublicRelease } = require("./public-release");
const { captureResearch } = require("./research-handoff");
const { captureReport, writeReport } = require("./report");
const { searchCorpus } = require("./search");
const { selfIngest } = require("./self-ingest");
const { writeStateDiff } = require("./states");
const { writeSurveillance } = require("./surveil");
const { formatWatchProfileLine, listActiveWatchProfiles, resolveWatchSubject, writeWatchRefreshReport } = require("./watch");

const USAGE_LINES = [
  ".\\cato.cmd init",
  ".\\cato.cmd ingest [--from inbox/drop_here] [--copy] [--allow-sensitive]",
  ".\\cato.cmd pdf-pack [--from inbox/drop_here] [--limit 8] [--dpi 144] [--max-pages 0]",
  ".\\cato.cmd self-ingest [--from inbox/self] [--schema constitution|mode|preference|bias|anti-pattern|heuristic|decision-rule|communication-style|portfolio-philosophy|postmortem] [--type auto|principles|heuristics|...]",
  ".\\cato.cmd compile [--promote-candidates]",
  ".\\cato.cmd search \"query\" [--limit 8]",
  ".\\cato.cmd crystallize path\\to\\artifact.md",
  ".\\cato.cmd capture-crystallize path\\to\\bundle.json",
  ".\\cato.cmd capture-research path\\to\\bundle.json [--promote] [--no-surveil]",
  ".\\cato.cmd frontier-pack \"topic\" [--mode decision|belief|state|meeting] [--kind report|brief|meeting-brief|deck] [--subjects \"Global Macro,Geopolitical Risk\"]",
  ".\\cato.cmd capture-frontier path\\to\\bundle.json [--promote] [--no-surveil]",
  ".\\cato.cmd capture-pdf path\\to\\bundle.json [--copy] [--promote-candidates]",
  ".\\cato.cmd capture-authored path\\to\\bundle.json",
  ".\\cato.cmd memory-refresh [--scope current|weekly|all] [--force]",
  ".\\cato.cmd capture-memory path\\to\\bundle.json",
  ".\\cato.cmd memory-status",
  ".\\cato.cmd ask \"question\" [--limit 6] [--save-question] [--promote]",
  ".\\cato.cmd report \"topic\" [--limit 10]",
  ".\\cato.cmd capture-report path\\to\\bundle.json",
  ".\\cato.cmd deck \"topic\" [--limit 8] [--promote]",
  ".\\cato.cmd surveil \"topic\" [--limit 10]",
  ".\\cato.cmd watch \"topic\" [--context \"...\"] [--aliases \"...\"] [--entities \"...\"] [--concepts \"...\"] [--triggers \"...\"]",
  ".\\cato.cmd watch-refresh [--topic \"topic\"] [--limit 10]",
  ".\\cato.cmd watch-list",
  ".\\cato.cmd claims-refresh [--snapshot]",
  ".\\cato.cmd claim-diff [--topic \"topic\"]",
  ".\\cato.cmd why-believe \"topic\" [--limit 10]",
  ".\\cato.cmd state-refresh \"subject\" [--claim-limit 12] [--evidence-limit 8]",
  ".\\cato.cmd state-diff \"subject\"",
  ".\\cato.cmd regime-brief [--set weekly-investment-meeting] [--subjects \"Global Macro,US Inflation\"]",
  ".\\cato.cmd meeting-brief \"title\" [--subjects \"Global Macro,US Inflation\"]",
  ".\\cato.cmd decision-note \"topic\"",
  ".\\cato.cmd red-team \"topic\"",
  ".\\cato.cmd what-changed-for-markets [--subjects \"Global Macro,Geopolitical Risk\"]",
  ".\\cato.cmd reflect [--promote]",
  ".\\cato.cmd principles",
  ".\\cato.cmd postmortem \"title\" [--notes \"...\"] [--from file]",
  ".\\cato.cmd doctor",
  ".\\cato.cmd public-release [--to ..\\Cato_WisdomEngine_public]",
  ".\\cato.cmd lint"
];

const OPTION_LINES = [
  "--root PATH           Use a different project root.",
  "--copy                Keep the original file in inbox after ingest.",
  "--allow-sensitive     Override the quarantine gate and ingest files even when secret-like patterns are detected.",
  "--schema NAME         Override self-note schema during self-ingest.",
  "--type NAME           Legacy alias for self-ingest schema routing. Use auto to keep keyword fallback.",
  "--dpi N               Render PDF pack page images at this DPI. Default: 144.",
  "--max-pages N         Limit rendered pages per PDF pack document. Default: 0 = all pages.",
  "--save-question       Also create a question page in wiki/questions.",
  "--promote-candidates  Promote repeated candidate concepts into concept pages.",
  "--promote             File the generated output back into wiki/synthesis.",
  "--no-surveil          Skip surveillance refresh during capture-research or capture-frontier even if the bundle includes watch data.",
  "--no-refresh          Create/update the watch profile without refreshing surveillance.",
  "--snapshot            Write a timestamped claim snapshot during claims-refresh.",
  "--scope NAME          Memory refresh scope: current, weekly, or all.",
  "--force               Force a memory refresh even if the current period is already current.",
  "--to PATH             Write a public-safe export to PATH instead of the default tmp/public-release target."
];

function buildHelpText() {
  return `
Cato_WisdomEngine CLI

Usage:
  ${USAGE_LINES.join("\n  ")}

Options:
  ${OPTION_LINES.join("\n  ")}
`;
}

function joinedPositionals(parsed) {
  return parsed.positionals.join(" ").trim();
}

function requireValue(value, message) {
  if (!String(value || "").trim()) {
    throw new Error(message);
  }
  return String(value).trim();
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

function logAuthoredPack(result) {
  console.log(`Authored pack: ${result.packPath}`);
  console.log(`Prompt: ${result.promptPath}`);
  console.log(`Capture bundle: ${result.capturePath}`);
  console.log(`Final output path: ${result.outputPath}`);
}

function logMemoryAutomation(result) {
  if (result?.captured?.length) {
    for (const entry of result.captured) {
      console.log(`Working memory refreshed (${entry.scope}): ${entry.outputPath}`);
    }
    return;
  }
  if (!result?.generated?.length) {
    return;
  }
  for (const pack of result.generated) {
    console.log(`Working memory refresh queued (${pack.scope}): ${pack.capturePath}`);
  }
}

function authoredPackCommand(kind, config = {}) {
  return {
    run(root, parsed) {
      const fallbackTitle = config.fallbackTitle || "";
      const seed = joinedPositionals(parsed) || fallbackTitle || "";
      const topic = config.errorMessage ? requireValue(seed, config.errorMessage) : seed;
      const result = writeAuthoredPack(root, kind, topic, parsed.options);
      logAuthoredPack(result);
      return result;
    }
  };
}

function captureCommand(handler, example, renderResult) {
  return {
    run(root, parsed) {
      const bundlePath = requireValue(joinedPositionals(parsed), example);
      const result = handler(root, bundlePath, parsed.options);
      renderResult(result, bundlePath);
      return result;
    }
  };
}

function buildCommandRegistry() {
  const registry = {
    help: {
      run() {
        console.log(buildHelpText());
      }
    },
    init: {
      run(root) {
        const result = initProject(root);
        console.log(`Initialised project structure in ${root}`);
        console.log(`Compiled indices: ${JSON.stringify(result.compileResult)}`);
        return result;
      }
    },
    "public-release": {
      run(root, parsed) {
        const result = buildPublicRelease(root, parsed.options);
        console.log(`Prepared public-safe export at ${result.targetDir}`);
        console.log(`Manifest: ${result.manifestPath}`);
        console.log(`Copied paths: ${result.copiedPaths.length}`);
        console.log(`Excluded paths removed: ${result.removedPaths.length}`);
        return result;
      }
    },
    ingest: {
      run(root, parsed) {
        const result = ingest(root, parsed.options);
        console.log(`Ingested ${result.ingested} file(s).`);
        if (result.quarantined) {
          console.log(`Quarantined ${result.quarantined} file(s) for sensitive-data review.`);
        }
        return result;
      }
    },
    crystallize: {
      run(root, parsed) {
        const input = requireValue(
          joinedPositionals(parsed),
          'Crystallize requires a target artifact path or title. Example: .\\cato.cmd crystallize .\\outputs\\reports\\my-report.md'
        );
        const result = writeCrystallizePack(root, input, parsed.options);
        console.log(`Crystallize pack: ${result.packPath}`);
        console.log(`Prompt: ${result.promptPath}`);
        console.log(`Capture bundle: ${result.capturePath}`);
        console.log(`Source artifact: ${result.sourcePath}`);
        console.log(`Output path: ${result.outputPath}`);
        return result;
      }
    },
    "capture-crystallize": captureCommand(
      (root, bundlePath) => captureCrystallize(root, bundlePath),
      'Capture-crystallize requires a bundle path. Example: .\\cato.cmd capture-crystallize .\\cache\\crystallize-packs\\...-capture.json',
      (result, bundlePath) => {
        console.log(`Captured crystallize bundle: ${bundlePath}`);
        if (result.outputResult) {
          console.log(`Wrote crystallized synthesis note to ${result.outputResult.outputPath}`);
        }
      }
    ),
    "pdf-pack": {
      run(root, parsed) {
        const result = writePdfPack(root, parsed.options);
        console.log(`Prepared PDF vision pack for ${result.documents} document(s).`);
        console.log(`Pack manifest: ${result.packPath}`);
        console.log(`Prompt: ${result.promptPath}`);
        console.log(`Capture bundle: ${result.capturePath}`);
        return result;
      }
    },
    "self-ingest": {
      run(root, parsed) {
        const result = selfIngest(root, parsed.options);
        console.log(`Ingested ${result.ingested} self-note(s).`);
        return result;
      }
    },
    compile: {
      run(root, parsed) {
        const result = compileProject(root, {
          promoteCandidates: Boolean(parsed.options["promote-candidates"])
        });
        console.log(
          `Compiled source notes=${result.sourceNotes}, concepts=${result.concepts}, entities=${result.entities}, timelines=${result.timelines}, contradiction_candidates=${result.contradictionCandidates}`
        );
        return result;
      }
    },
    search: {
      run(root, parsed) {
        const query = requireValue(joinedPositionals(parsed), 'Search requires a query. Example: .\\cato.cmd search "market structure"');
        printSearchResults(searchCorpus(root, query, { limit: parsed.options.limit || 8 }));
      }
    },
    "capture-research": captureCommand(
      (root, bundlePath, options) =>
        captureResearch(root, bundlePath, {
          promote: Boolean(options.promote),
          noSurveil: Boolean(options["no-surveil"])
        }),
      'Capture-research requires a bundle path. Example: .\\cato.cmd capture-research .\\commands\\research-capture.example.json',
      (result) => {
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
      }
    ),
    "frontier-pack": {
      run(root, parsed) {
        const seed = joinedPositionals(parsed) || parsed.options.title || "";
        requireValue(seed, 'Frontier-pack requires a topic or title. Example: .\\cato.cmd frontier-pack "Global Macro" --mode decision');
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
        return result;
      }
    },
    "capture-frontier": captureCommand(
      (root, bundlePath, options) =>
        captureFrontier(root, bundlePath, {
          promote: Boolean(options.promote),
          noSurveil: Boolean(options["no-surveil"])
        }),
      'Capture-frontier requires a bundle path. Example: .\\cato.cmd capture-frontier .\\cache\\frontier-packs\\...-capture.json',
      (result, bundlePath) => {
        console.log(`Captured frontier bundle: ${bundlePath}`);
        console.log(`Captured sources ingested: ${result.ingested}`);
        if (result.outputResult) {
          console.log(`Wrote output to ${result.outputResult.outputPath}`);
          if (result.outputResult.promotedPath) {
            console.log(`Promoted synthesis note to ${result.outputResult.promotedPath}`);
          }
        }
      }
    ),
    "capture-pdf": captureCommand(
      (root, bundlePath, options) => capturePdf(root, bundlePath, options),
      'Capture-pdf requires a bundle path. Example: .\\cato.cmd capture-pdf .\\cache\\pdf-packs\\...-capture.json',
      (result) => {
        console.log(`PDF documents staged: ${result.staged.length}`);
        console.log(`PDF documents ingested: ${result.ingested}`);
        if (result.failures.length) {
          console.log(`Capture failures: ${result.failures.length}`);
        }
      }
    ),
    "capture-authored": captureCommand(
      (root, bundlePath, options) => captureAuthored(root, bundlePath, { promote: Boolean(options.promote) }),
      'Capture-authored requires a bundle path. Example: .\\cato.cmd capture-authored .\\cache\\authored-packs\\...-capture.json',
      (result, bundlePath) => {
        console.log(`Captured authored bundle: ${bundlePath}`);
        if (result.outputResult) {
          console.log(`Wrote authored output to ${result.outputResult.outputPath}`);
          if (result.outputResult.promotedPath) {
            console.log(`Promoted synthesis note to ${result.outputResult.promotedPath}`);
          }
        }
      }
    ),
    ask: authoredPackCommand("ask", { errorMessage: 'Ask requires a question. Example: .\\cato.cmd ask "What are the key drivers of X?"' }),
    report: {
      run(root, parsed) {
        const topic = requireValue(joinedPositionals(parsed), 'Report requires a topic. Example: .\\cato.cmd report "Passive flows and liquidity"');
        const result = writeReport(root, topic, { limit: parsed.options.limit });
        console.log(`Report pack: ${result.packPath}`);
        console.log(`Prompt: ${result.promptPath}`);
        console.log(`Capture bundle: ${result.capturePath}`);
        console.log(`Canonical final report path: ${result.canonicalPath}`);
        console.log(`Evidence results: ${result.results.length}`);
        return result;
      }
    },
    "capture-report": captureCommand(
      (root, bundlePath) => captureReport(root, bundlePath),
      'Capture-report requires a bundle path. Example: .\\cato.cmd capture-report .\\cache\\report-packs\\...-capture.json',
      (result, bundlePath) => {
        console.log(`Captured report bundle: ${bundlePath}`);
        if (result.outputResult) {
          console.log(`Wrote canonical report to ${result.outputResult.outputPath}`);
          if (result.outputResult.archivedPath) {
            console.log(`Archived previous canonical version to ${result.outputResult.archivedPath}`);
          }
        }
      }
    ),
    deck: authoredPackCommand("deck", { errorMessage: 'Deck requires a topic. Example: .\\cato.cmd deck "AI capex and market structure"' }),
    surveil: authoredPackCommand("surveil", { errorMessage: 'Surveil requires a subject. Example: .\\cato.cmd surveil "Passive flows"' }),
    watch: authoredPackCommand(
      "watch",
      { errorMessage: 'Watch requires a subject. Example: .\\cato.cmd watch "Middle East" --context "Track escalation risk for the defensive fund."' }
    ),
    "watch-refresh": {
      run(root, parsed) {
        const topic = parsed.options.topic || joinedPositionals(parsed);
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
        return {
          refreshed,
          reportPath
        };
      }
    },
    "watch-list": {
      run(root) {
        printWatchProfiles(listActiveWatchProfiles(root));
      }
    },
    "claims-refresh": {
      run(root, parsed) {
        const result = refreshClaims(root, { writeSnapshot: Boolean(parsed.options.snapshot) });
        console.log(`Claims refreshed: ${result.claims}`);
        console.log(`Contested claims: ${result.contested}`);
        if (result.snapshotPath) {
          console.log(`Snapshot: ${result.snapshotPath}`);
        }
        if (result.diffReportPath) {
          console.log(`Diff report: ${result.diffReportPath}`);
        }
        return result;
      }
    },
    "memory-refresh": {
      run(root, parsed) {
        const result = writeMemoryRefreshPack(root, {
          scope: parsed.options.scope,
          force: Boolean(parsed.options.force)
        });
        if (!result.generated.length) {
          console.log("Working memory is already current for the requested scope.");
          return result;
        }
        const captured = [];
        for (const pack of result.generated) {
          console.log(`Working memory pack (${pack.scope}): ${pack.packPath}`);
          console.log(`Prompt: ${pack.promptPath}`);
          console.log(`Capture bundle: ${pack.capturePath}`);
          const captureResult = captureMemory(root, pack.capturePath);
          captured.push({
            scope: pack.scope,
            outputPath: captureResult.outputResult?.outputPath || ""
          });
          if (captureResult.outputResult?.outputPath) {
            console.log(`Wrote memory output to ${captureResult.outputResult.outputPath}`);
          }
        }
        return {
          ...result,
          captured
        };
      }
    },
    "capture-memory": captureCommand(
      (root, bundlePath, options) => captureMemory(root, bundlePath, options),
      'Capture-memory requires a bundle path. Example: .\\cato.cmd capture-memory .\\cache\\memory-packs\\...-capture.json',
      (result, bundlePath) => {
        console.log(`Captured memory bundle: ${bundlePath}`);
        if (result.outputResult) {
          console.log(`Wrote memory output to ${result.outputResult.outputPath}`);
          if (result.outputResult.archivedPath) {
            console.log(`Archived previous memory snapshot to ${result.outputResult.archivedPath}`);
          }
        }
      }
    ),
    "memory-status": {
      run(root) {
        const result = workingMemoryStatus(root);
        console.log(`Working memory date: ${result.date}`);
        console.log(`Working memory week: ${result.weekKey}`);
        console.log(`Events today: ${result.eventsToday}`);
        console.log(`Current context: ${result.currentContext.reason}`);
        if (result.currentContext.pendingCapturePath) {
          console.log(`Current context pending capture: ${result.currentContext.pendingCapturePath}`);
        }
        console.log(`Weekly review: ${result.weeklyReview.reason}`);
        if (result.weeklyReview.pendingCapturePath) {
          console.log(`Weekly review pending capture: ${result.weeklyReview.pendingCapturePath}`);
        }
        return result;
      }
    },
    "claim-diff": {
      run(root, parsed) {
        const result = diffLatestClaimSnapshots(root, {
          topic: parsed.options.topic || joinedPositionals(parsed)
        });
        if (!result.reportPath) {
          console.log("Not enough claim snapshots to diff.");
          return;
        }
        console.log(`Claim diff: ${result.reportPath}`);
        console.log(`Added: ${result.added}, Removed: ${result.removed}, Contested: ${result.contested}`);
      }
    },
    "why-believe": authoredPackCommand("why-believe", { errorMessage: 'Why-believe requires a topic. Example: .\\cato.cmd why-believe "US inflation"' }),
    "state-refresh": authoredPackCommand("state-refresh", { errorMessage: 'State-refresh requires a subject. Example: .\\cato.cmd state-refresh "Global Macro"' }),
    "state-diff": {
      run(root, parsed) {
        const subject = requireValue(joinedPositionals(parsed), 'State-diff requires a subject. Example: .\\cato.cmd state-diff "Global Macro"');
        const result = writeStateDiff(root, subject);
        console.log(`Wrote state diff to ${result.outputPath}`);
        console.log(`Changed claims: ${result.changed}`);
      }
    },
    "regime-brief": authoredPackCommand("regime-brief"),
    "meeting-brief": authoredPackCommand("meeting-brief", { fallbackTitle: "Weekly investment meeting brief" }),
    "decision-note": authoredPackCommand("decision-note", { errorMessage: 'Decision-note requires a topic. Example: .\\cato.cmd decision-note "Middle East"' }),
    "red-team": authoredPackCommand("red-team", { errorMessage: 'Red-team requires a topic. Example: .\\cato.cmd red-team "US inflation"' }),
    "what-changed-for-markets": authoredPackCommand("what-changed-for-markets"),
    reflect: authoredPackCommand("reflect", { fallbackTitle: "Self Reflection" }),
    principles: authoredPackCommand("principles", { fallbackTitle: "Principles Snapshot" }),
    postmortem: authoredPackCommand("postmortem", { errorMessage: 'Postmortem requires a title. Example: .\\cato.cmd postmortem "Q1 satellite ETF review"' }),
    doctor: {
      run(root) {
        const result = runDoctor(root);
        console.log(`Doctor report: ${result.reportPath}`);
        console.log(`Issues found: ${result.issues.length}`);
        console.log(`Lint issues snapshot: ${result.lintIssues}`);
        return result;
      }
    },
    lint: {
      run(root) {
        const result = lintProject(root);
        console.log(`Lint report: ${result.reportPath}`);
        console.log(`Issues found: ${result.issues.length}`);
        return result;
      }
    }
  };

  for (const [command, entry] of Object.entries(registry)) {
    if (!entry || typeof entry.run !== "function") {
      continue;
    }
    const originalRun = entry.run;
    entry.run = (root, parsed) => {
      const result = originalRun(root, parsed);
      logMemoryAutomation(
        handleWorkingMemoryAfterCommand(root, {
          command,
          parsed,
          result
        })
      );
      return result;
    };
  }

  return registry;
}

module.exports = {
  buildCommandRegistry,
  buildHelpText
};
