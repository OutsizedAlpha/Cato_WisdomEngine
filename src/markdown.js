const path = require("node:path");

function parseScalar(rawValue) {
  const value = rawValue.trim();
  if (!value) {
    return "";
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  if (value === "null") {
    return null;
  }
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return Number(value);
  }
  if ((value.startsWith("[") && value.endsWith("]")) || (value.startsWith("{") && value.endsWith("}"))) {
    try {
      return JSON.parse(value);
    } catch (error) {
      return value;
    }
  }
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function parseFrontmatter(content) {
  if (!content.startsWith("---\n") && !content.startsWith("---\r\n")) {
    return { frontmatter: {}, body: content };
  }

  const lines = content.split(/\r?\n/);
  if (lines[0] !== "---") {
    return { frontmatter: {}, body: content };
  }

  const frontmatter = {};
  let currentArrayKey = null;
  let index = 1;

  for (; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === "---") {
      index += 1;
      break;
    }
    const arrayMatch = line.match(/^\s*-\s+(.*)$/);
    if (currentArrayKey && arrayMatch) {
      frontmatter[currentArrayKey].push(parseScalar(arrayMatch[1]));
      continue;
    }
    const keyMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!keyMatch) {
      currentArrayKey = null;
      continue;
    }
    const [, key, rawValue] = keyMatch;
    if (rawValue === "") {
      frontmatter[key] = [];
      currentArrayKey = key;
    } else {
      frontmatter[key] = parseScalar(rawValue);
      currentArrayKey = null;
    }
  }

  return {
    frontmatter,
    body: lines.slice(index).join("\n")
  };
}

function formatScalar(value) {
  if (Array.isArray(value) || value === null) {
    return JSON.stringify(value);
  }
  if (typeof value === "boolean" || typeof value === "number") {
    return String(value);
  }
  const stringValue = String(value ?? "");
  if (!stringValue) {
    return "";
  }
  if (/^[A-Za-z0-9_./:@ -]+$/.test(stringValue) && !stringValue.includes(": ")) {
    return stringValue;
  }
  return JSON.stringify(stringValue);
}

function renderFrontmatter(frontmatter) {
  const lines = ["---"];
  for (const [key, value] of Object.entries(frontmatter)) {
    lines.push(`${key}: ${formatScalar(value)}`);
  }
  lines.push("---");
  return `${lines.join("\n")}\n`;
}

function renderMarkdown(frontmatter, body) {
  return `${renderFrontmatter(frontmatter)}\n${body.trim()}\n`;
}

function stripMarkdownFormatting(content) {
  return content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)]\(([^)]+)\)/g, "$1")
    .replace(/^>\s*/gm, "")
    .replace(/^#+\s*/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/[_~]/g, "")
    .replace(/\r/g, "")
    .replace(/\n{2,}/g, "\n\n");
}

function stripHtml(content) {
  return content
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeWikiTarget(target) {
  return target
    .split("|")[0]
    .split("#")[0]
    .replace(/^\.\//, "")
    .replace(/\\/g, "/")
    .replace(/\.md$/i, "")
    .trim();
}

function extractWikiLinks(content) {
  const matches = [];
  const regex = /\[\[([^\]]+)\]\]/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    matches.push(normalizeWikiTarget(match[1]));
  }
  return matches;
}

function toWikiLink(relativePath, title = null) {
  const linkTarget = relativePath.replace(/^wiki\//, "").replace(/\.md$/i, "");
  return title ? `[[${linkTarget}|${title}]]` : `[[${linkTarget}]]`;
}

function upsertManagedBlock(content, name, blockContent) {
  const startMarker = `<!-- CATO:BEGIN_MANAGED_BLOCK ${name} -->`;
  const endMarker = `<!-- CATO:END_MANAGED_BLOCK ${name} -->`;
  const block = [startMarker, blockContent.trim(), endMarker].join("\n");
  const escapedStart = startMarker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedEnd = endMarker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`${escapedStart}[\\s\\S]*?${escapedEnd}`, "m");

  if (pattern.test(content)) {
    return content.replace(pattern, block);
  }

  return `${content.trim()}\n\n${block}\n`;
}

function sectionContent(body, heading) {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`^##\\s+${escapedHeading}\\s*$([\\s\\S]*?)(?=^##\\s+|\\Z)`, "im");
  const match = body.match(regex);
  return match ? match[1].trim() : "";
}

function stemFromPath(filePath) {
  return path.basename(filePath, path.extname(filePath));
}

module.exports = {
  extractWikiLinks,
  normalizeWikiTarget,
  parseFrontmatter,
  renderMarkdown,
  sectionContent,
  stemFromPath,
  stripHtml,
  stripMarkdownFormatting,
  toWikiLink,
  upsertManagedBlock
};
