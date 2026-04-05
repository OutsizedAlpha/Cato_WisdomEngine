param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("open-vault", "refresh", "capture-research", "frontier-pack", "capture-frontier", "report", "ask", "deck", "surveil", "watch", "watch-refresh", "claims", "state", "regime", "decision", "meeting-brief", "red-team", "market-changes", "reflect", "doctor", "open-latest-report")]
  [string]$Action,
  [string]$Prompt,
  [string]$Context,
  [string]$Mode,
  [switch]$SkipPromote,
  [switch]$SkipOpen,
  [string]$BundlePath
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$CatoCli = Join-Path $RepoRoot "bin\cato.js"

function Invoke-CatoCommand([string[]]$CommandArgs) {
  & node $CatoCli @CommandArgs
  if ($LASTEXITCODE -ne 0) {
    throw "Cato command failed: $($CommandArgs -join ' ')"
  }
}

function Resolve-InteractivePrompt([string]$Current, [string]$Label) {
  if ($Current) {
    return $Current
  }
  return Read-Host $Label
}

function Get-LatestMarkdown([string]$DirectoryPath, [string[]]$ExcludeNames = @()) {
  if (-not (Test-Path -LiteralPath $DirectoryPath)) {
    return $null
  }

  return Get-ChildItem -LiteralPath $DirectoryPath -File -Filter *.md |
    Where-Object { $ExcludeNames -notcontains $_.Name } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
}

function Open-InObsidian([string]$TargetPath) {
  $resolvedPath = (Resolve-Path -LiteralPath $TargetPath).Path
  $uri = "obsidian://open?path=" + [System.Uri]::EscapeDataString($resolvedPath)
  try {
    Start-Process $uri | Out-Null
  } catch {
    Start-Process $resolvedPath | Out-Null
  }
}

switch ($Action) {
  "open-vault" {
    if (-not $SkipOpen) {
      Open-InObsidian $RepoRoot
    }
  }
  "refresh" {
    Invoke-CatoCommand -CommandArgs @("ingest")
    Invoke-CatoCommand -CommandArgs @("self-ingest")
    Invoke-CatoCommand -CommandArgs @("compile", "--promote-candidates")
    if (-not $SkipOpen) {
      Open-InObsidian (Join-Path $RepoRoot "wiki\_maps\home.md")
    }
  }
  "capture-research" {
    $bundleSeed = if ($BundlePath) { $BundlePath } else { $Prompt }
    $bundle = Resolve-InteractivePrompt $bundleSeed "Path to research bundle JSON"
    Invoke-CatoCommand -CommandArgs @("capture-research", $bundle)
    if (-not $SkipOpen) {
      Open-InObsidian (Join-Path $RepoRoot "wiki\_indices\sources.md")
    }
  }
  "frontier-pack" {
    $topic = Resolve-InteractivePrompt $Prompt "Frontier pack topic or title"
    $packMode = if ($Mode) { $Mode } else { "decision" }
    Invoke-CatoCommand -CommandArgs @("frontier-pack", $topic, "--mode", $packMode)
    if (-not $SkipOpen) {
      $latest = Get-LatestMarkdown (Join-Path $RepoRoot "cache\frontier-packs")
      if ($latest) {
        Open-InObsidian $latest.FullName
      }
    }
  }
  "capture-frontier" {
    $bundleSeed = if ($BundlePath) { $BundlePath } else { $Prompt }
    $bundle = Resolve-InteractivePrompt $bundleSeed "Path to frontier capture bundle JSON"
    $commandArgs = @("capture-frontier", $bundle)
    if (-not $SkipPromote) {
      $commandArgs += "--promote"
    }
    Invoke-CatoCommand -CommandArgs $commandArgs
    if (-not $SkipOpen) {
      $latest = Get-LatestMarkdown (Join-Path $RepoRoot "outputs\reports")
      if ($latest) {
        Open-InObsidian $latest.FullName
      }
    }
  }
  "report" {
    $topic = Resolve-InteractivePrompt $Prompt "Report topic"
    Invoke-CatoCommand -CommandArgs @("compile", "--promote-candidates")
    Invoke-CatoCommand -CommandArgs @("report", $topic)
    if (-not $SkipOpen) {
      $latest = Get-LatestMarkdown (Join-Path $RepoRoot "cache\report-packs")
      if ($latest) {
        Open-InObsidian $latest.FullName
      }
    }
  }
  "ask" {
    $question = Resolve-InteractivePrompt $Prompt "Question"
    Invoke-CatoCommand -CommandArgs @("compile", "--promote-candidates")
    $commandArgs = @("ask", $question, "--save-question")
    Invoke-CatoCommand -CommandArgs $commandArgs
    if (-not $SkipOpen) {
      $latest = Get-LatestMarkdown (Join-Path $RepoRoot "outputs\memos")
      if ($latest) {
        Open-InObsidian $latest.FullName
      }
    }
  }
  "deck" {
    $topic = Resolve-InteractivePrompt $Prompt "Deck topic"
    Invoke-CatoCommand -CommandArgs @("compile", "--promote-candidates")
    $commandArgs = @("deck", $topic)
    if (-not $SkipPromote) {
      $commandArgs += "--promote"
    }
    Invoke-CatoCommand -CommandArgs $commandArgs
    if (-not $SkipOpen) {
      $latest = Get-LatestMarkdown (Join-Path $RepoRoot "outputs\decks")
      if ($latest) {
        Open-InObsidian $latest.FullName
      }
    }
  }
  "surveil" {
    $subject = Resolve-InteractivePrompt $Prompt "Surveillance subject"
    Invoke-CatoCommand -CommandArgs @("compile", "--promote-candidates")
    $commandArgs = @("surveil", $subject)
    Invoke-CatoCommand -CommandArgs $commandArgs
    if (-not $SkipOpen) {
      $latest = Get-LatestMarkdown (Join-Path $RepoRoot "wiki\surveillance") @("index.md")
      if ($latest) {
        Open-InObsidian $latest.FullName
      }
    }
  }
  "watch" {
    $subject = Resolve-InteractivePrompt $Prompt "Watch subject"
    $watchContext = Resolve-InteractivePrompt $Context "Why does this watch matter"
    Invoke-CatoCommand -CommandArgs @("watch", $subject, "--context", $watchContext)
    if (-not $SkipOpen) {
      $latest = Get-LatestMarkdown (Join-Path $RepoRoot "wiki\surveillance") @("index.md")
      if ($latest) {
        Open-InObsidian $latest.FullName
      }
    }
  }
  "watch-refresh" {
    if ($Prompt) {
      Invoke-CatoCommand -CommandArgs @("watch-refresh", "--topic", $Prompt)
    } else {
      Invoke-CatoCommand -CommandArgs @("watch-refresh")
    }
    if (-not $SkipOpen) {
      $latest = Get-LatestMarkdown (Join-Path $RepoRoot "logs\report_runs")
      if ($latest) {
        Open-InObsidian $latest.FullName
      }
    }
  }
  "claims" {
    Invoke-CatoCommand -CommandArgs @("claims-refresh", "--snapshot")
    if (-not $SkipOpen) {
      Open-InObsidian (Join-Path $RepoRoot "wiki\claims\index.md")
    }
  }
  "state" {
    $subject = Resolve-InteractivePrompt $Prompt "State subject"
    Invoke-CatoCommand -CommandArgs @("state-refresh", $subject)
    if (-not $SkipOpen) {
      $statePath = Join-Path $RepoRoot ("wiki\states\" + ($subject.ToLower() -replace "[^a-z0-9]+", "-").Trim("-") + ".md")
      if (Test-Path -LiteralPath $statePath) {
        Open-InObsidian $statePath
      }
    }
  }
  "regime" {
    Invoke-CatoCommand -CommandArgs @("regime-brief", "--set", "weekly-investment-meeting")
    if (-not $SkipOpen) {
      $latest = Get-LatestMarkdown (Join-Path $RepoRoot "outputs\briefs")
      if ($latest) {
        Open-InObsidian $latest.FullName
      }
    }
  }
  "decision" {
    $topic = Resolve-InteractivePrompt $Prompt "Decision topic"
    Invoke-CatoCommand -CommandArgs @("decision-note", $topic)
    if (-not $SkipOpen) {
      $decisionPath = Join-Path $RepoRoot ("wiki\decisions\" + ($topic.ToLower() -replace "[^a-z0-9]+", "-").Trim("-") + ".md")
      if (Test-Path -LiteralPath $decisionPath) {
        Open-InObsidian $decisionPath
      }
    }
  }
  "meeting-brief" {
    $title = Resolve-InteractivePrompt $Prompt "Meeting brief title"
    Invoke-CatoCommand -CommandArgs @("meeting-brief", $title)
    if (-not $SkipOpen) {
      $latest = Get-LatestMarkdown (Join-Path $RepoRoot "outputs\meeting-briefs")
      if ($latest) {
        Open-InObsidian $latest.FullName
      }
    }
  }
  "red-team" {
    $topic = Resolve-InteractivePrompt $Prompt "Red-team topic"
    Invoke-CatoCommand -CommandArgs @("red-team", $topic)
    if (-not $SkipOpen) {
      $latest = Get-LatestMarkdown (Join-Path $RepoRoot "outputs\briefs")
      if ($latest) {
        Open-InObsidian $latest.FullName
      }
    }
  }
  "market-changes" {
    Invoke-CatoCommand -CommandArgs @("what-changed-for-markets")
    if (-not $SkipOpen) {
      $latest = Get-LatestMarkdown (Join-Path $RepoRoot "outputs\briefs")
      if ($latest) {
        Open-InObsidian $latest.FullName
      }
    }
  }
  "reflect" {
    $commandArgs = @("reflect")
    if (-not $SkipPromote) {
      $commandArgs += "--promote"
    }
    Invoke-CatoCommand -CommandArgs $commandArgs
    if (-not $SkipOpen) {
      $latest = Get-LatestMarkdown (Join-Path $RepoRoot "outputs\memos")
      if ($latest) {
        Open-InObsidian $latest.FullName
      }
    }
  }
  "doctor" {
    Invoke-CatoCommand -CommandArgs @("doctor")
    if (-not $SkipOpen) {
      $latest = Get-LatestMarkdown (Join-Path $RepoRoot "logs\report_runs")
      if ($latest) {
        Open-InObsidian $latest.FullName
      }
    }
  }
  "open-latest-report" {
    $latest = Get-LatestMarkdown (Join-Path $RepoRoot "wiki\reports")
    if (-not $latest) {
      throw "No canonical report markdown files exist yet."
    }
    if (-not $SkipOpen) {
      Open-InObsidian $latest.FullName
    }
  }
}
