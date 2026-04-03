param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("open-vault", "refresh", "capture-research", "report", "ask", "deck", "surveil", "watch", "watch-refresh", "reflect", "doctor", "open-latest-report")]
  [string]$Action,
  [string]$Prompt,
  [string]$Context,
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
  "report" {
    $topic = Resolve-InteractivePrompt $Prompt "Report topic"
    Invoke-CatoCommand -CommandArgs @("compile", "--promote-candidates")
    $commandArgs = @("report", $topic)
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
    $latest = Get-LatestMarkdown (Join-Path $RepoRoot "outputs\reports")
    if (-not $latest) {
      throw "No report markdown files exist yet."
    }
    if (-not $SkipOpen) {
      Open-InObsidian $latest.FullName
    }
  }
}
