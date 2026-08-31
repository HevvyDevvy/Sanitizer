const fs = require('fs');
const path = require('path');

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', '.next',
  'venv', '.venv', '__pycache__', '.idea', '.vscode', 'coverage'
]);

const SCAN_EXTENSIONS = new Set(['.html', '.htm', '.jsx', '.tsx', '.vue', '.js', '.ts', '.py']);

// Each pattern: { type, canAutoInject, test(line) -> match info or null }
// "type" is a human label shown in the results table.
// canAutoInject is only true for patterns we can safely, non-destructively
// patch (adding an HTML attribute). Server-side entry points are reported
// only — rewriting request-handling logic automatically is too risky to
// do blind, regex-based, so those stay manual-review.

function classifyHtmlInput(line) {
  const isFile = /type\s*=\s*["']file["']/i.test(line);
  return isFile ? 'file-upload (html)' : 'text-input (html)';
}

const PATTERNS = [
  {
    type: 'html-input',
    regex: /<input\b[^>]*>/gi,
    canAutoInject: true,
    classify: classifyHtmlInput
  },
  {
    type: 'html-textarea',
    regex: /<textarea\b[^>]*>/gi,
    canAutoInject: true,
    classify: () => 'text-input (html textarea)'
  },
  {
    type: 'flask-form-field',
    regex: /request\.form(?:\.get)?\(?\[?['"][\w-]+['"]\]?\)?/g,
    canAutoInject: false,
    classify: () => 'server text field (Flask)'
  },
  {
    type: 'flask-files',
    regex: /request\.files(?:\[['"][\w-]+['"]\]|\.get\(['"][\w-]+['"]\))?/g,
    canAutoInject: false,
    classify: () => 'server file field (Flask)'
  },
  {
    type: 'express-body',
    regex: /req\.body(?:\.\w+|\[['"][\w-]+['"]\])/g,
    canAutoInject: false,
    classify: () => 'server text field (Express)'
  },
  {
    type: 'express-files',
    regex: /(req\.files|multer\s*\()/g,
    canAutoInject: false,
    classify: () => 'server file field (Express/Multer)'
  }
];

function walk(dir, results) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(path.join(dir, entry.name), results);
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (SCAN_EXTENSIONS.has(ext)) {
      results.push(path.join(dir, entry.name));
    }
  }
}

function lineNumberAt(text, index) {
  let line = 1;
  for (let i = 0; i < index; i++) {
    if (text[i] === '\n') line++;
  }
  return line;
}

/**
 * Scan a project directory for text-input and file-upload entry points.
 * Returns an array of findings. Each finding includes a proposed patched
 * line (for canAutoInject === true findings) so the caller can render a
 * diff before writing anything to disk.
 */
function scanProject(rootDir, profileName) {
  const files = [];
  walk(rootDir, files);

  const findings = [];
  let id = 0;

  for (const filePath of files) {
    let content;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch (e) {
      continue;
    }

    for (const pattern of PATTERNS) {
      pattern.regex.lastIndex = 0;
      let match;
      while ((match = pattern.regex.exec(content)) !== null) {
        const line = lineNumberAt(content, match.index);
        const lineStart = content.lastIndexOf('\n', match.index) + 1;
        const lineEndIdx = content.indexOf('\n', match.index);
        const lineEnd = lineEndIdx === -1 ? content.length : lineEndIdx;
        const originalLine = content.slice(lineStart, lineEnd);

        let proposedLine = null;
        if (pattern.canAutoInject) {
          proposedLine = injectAttribute(originalLine, match[0], profileName);
        }

        findings.push({
          id: id++,
          file: filePath,
          line,
          type: pattern.classify(match[0]),
          canAutoInject: pattern.canAutoInject && proposedLine !== originalLine,
          snippet: originalLine.trim().slice(0, 200),
          originalLine,
          proposedLine
        });
      }
    }
  }

  return findings;
}

// Adds data-sanitize-profile="<profile>" to an <input>/<textarea> tag if
// not already present. Purely additive — never removes existing attributes.
function injectAttribute(line, matchedTag, profileName) {
  if (/data-sanitize-profile\s*=/.test(matchedTag)) return line; // already wired
  const patchedTag = matchedTag.replace(
    /^<(input|textarea)\b/i,
    `<$1 data-sanitize-profile="${profileName}"`
  );
  return line.replace(matchedTag, patchedTag);
}

/**
 * Apply a set of previously-computed findings (from scanProject) to disk.
 * Writes a .bak backup alongside each modified file before overwriting.
 * Only findings with canAutoInject === true should ever be passed here.
 */
function applyFindings(findings) {
  const byFile = new Map();
  for (const f of findings) {
    if (!f.canAutoInject) continue;
    if (!byFile.has(f.file)) byFile.set(f.file, []);
    byFile.get(f.file).push(f);
  }

  const applied = [];
  for (const [filePath, fileFindings] of byFile.entries()) {
    let content;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch (e) {
      continue;
    }
    let newContent = content;
    for (const f of fileFindings) {
      if (newContent.includes(f.originalLine)) {
        newContent = newContent.replace(f.originalLine, f.proposedLine);
      }
    }
    if (newContent !== content) {
      fs.writeFileSync(filePath + '.bak', content, 'utf8');
      fs.writeFileSync(filePath, newContent, 'utf8');
      applied.push(filePath);
    }
  }
  return applied;
}

module.exports = { scanProject, applyFindings };
