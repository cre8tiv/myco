#!/usr/bin/env node
// Renders a design package, or the hub listing every package, as one self-contained
// HTML page for publishing as a claude.ai artifact. The package documents are rendered
// faithfully from their markdown, so the page never drifts from what engineering reads.
//
//   node render-review.mjs package --dir <packages_dir>/<slug> --title "<page title>"
//        --out <file.html> [--round <n>] [--summary <file.md>]   (default summary: review.md)
//   node render-review.mjs hub --dir <packages_dir> --title "<page title>" --out <file.html>
//
// Standard library only. The output has no <html>/<head>/<body>: the artifact host
// wraps it. Mermaid fences become <pre class="mermaid">, which the host renders.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

/** Package documents in reading order: [file, section id, nav label]. */
const DOCS = [
  ['README.md', 'package', 'Package'],
  ['prd.md', 'prd', 'PRD'],
  ['ux.md', 'ux', 'UX'],
  ['architecture.md', 'architecture', 'Architecture'],
  ['security-review.md', 'security', 'Security review'],
  ['tech-design.md', 'tech-design', 'Tech design'],
];
const DOC_LINKS = { ...Object.fromEntries(DOCS.map(([f, id]) => [f.toLowerCase(), id])), 'review.md': 'overview' };

// ---------- arguments ----------

/** @param {string[]} argv @returns {{cmd: string, opts: Record<string,string>}} */
function parseArgs(argv) {
  const [cmd, ...rest] = argv;
  /** @type {Record<string,string>} */
  const opts = {};
  for (let i = 0; i < rest.length; i++) {
    if (rest[i].startsWith('--')) opts[rest[i].slice(2)] = rest[i + 1] ?? '';
    if (rest[i].startsWith('--')) i++;
  }
  return { cmd, opts };
}

// ---------- markdown ----------

/** @param {string} s */
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** @param {string} s */
const slug = (s) => s.toLowerCase().replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Requirement, decision, actor, scenario, control, threat, ADR and surface IDs.
const ID_RE = /\b((?:[A-Z]{1,5}-\d+)|(?:ADR-\d+))\b/g;
// Standard names that look like IDs.
const NOT_IDS = /^(UTF|SHA|ISO|RFC|HTTP|TLS|SSL|MD|AES|RSA|ES|IEEE|CVE|CWE|OWASP|PEP|WCAG)-/;

/**
 * Renders inline markdown: code spans, links, bold, italic, and design IDs as chips.
 * @param {string} text
 * @param {string} prefix section id, for in-page anchors
 * @returns {string}
 */
function inline(text, prefix) {
  /** @type {string[]} */
  const held = [];
  const hold = (html) => `\u0000${held.push(html) - 1}\u0000`;
  // One pass, so a code span inside a link label renders inside the link, and link syntax
  // inside a code span stays literal.
  let s = text.replace(/`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g, (_, c, label, href) =>
    hold(c !== undefined ? `<code>${esc(c)}</code>` : link(label, href, prefix)));
  s = s.replace(/<(https?:\/\/[^>\s]+)>/g, (_, u) => hold(`<a href="${esc(u)}" target="_blank" rel="noopener">${esc(u)}</a>`));
  s = esc(s);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  s = s.replace(/(^|[\s(])_([^_\s][^_]*)_(?=[\s.,;:)!?]|$)/g, '$1<em>$2</em>');
  s = s.replace(ID_RE, (m) => (NOT_IDS.test(m) ? m : `<span class="id">${m}</span>`));
  s = s.replace(/\u0000(\d+)\u0000/g, (_, n) => held[Number(n)]);
  return s;
}

/**
 * A link to another package document becomes an in-page anchor; an external URL opens
 * in a new tab; a repository path, which a reviewer can't open, is shown as code.
 * @param {string} label @param {string} href @param {string} prefix
 */
function link(label, href, prefix) {
  const text = inline(label, prefix);
  if (/^https?:\/\//.test(href)) return `<a href="${esc(href)}" target="_blank" rel="noopener">${text}</a>`;
  if (href.startsWith('#')) return `<a href="#${prefix}-${slug(href.slice(1))}">${text}</a>`;
  const [file, anchor] = href.split('#');
  const doc = DOC_LINKS[path.basename(file).toLowerCase()];
  if (doc) return `<a href="#${anchor ? `${doc}-${slug(anchor)}` : doc}">${text}</a>`;
  return `${text} <code class="path">${esc(href)}</code>`;
}

/**
 * Renders a markdown document to HTML. Covers what the design templates use: headings,
 * paragraphs, nested lists and task lists, tables, fenced code, Mermaid, blockquotes,
 * rules. Raw HTML in the source is escaped, not passed through.
 * @param {string} md
 * @param {string} prefix section id, prefixed to heading ids so documents can't collide
 * @returns {string}
 */
function renderMarkdown(md, prefix) {
  const lines = md.replace(/\r\n?/g, '\n').replace(/<!--[\s\S]*?-->/g, '').split('\n');
  return blocks(lines, prefix);
}

/** @param {string[]} lines @param {string} prefix @returns {string} */
function blocks(lines, prefix) {
  let out = '';
  let i = 0;
  const isList = (l) => /^\s*(?:[-*+]|\d+[.)])\s+/.test(l);
  const isTableSep = (l) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
  const startsBlock = (l, next) =>
    /^\s*```/.test(l) || /^#{1,6}\s/.test(l) || /^\s*>/.test(l) || isList(l) ||
    /^\s*(-{3,}|\*{3,})\s*$/.test(l) || (/^\s*\|/.test(l) && next !== undefined && isTableSep(next));

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    const fence = line.match(/^(\s*)```\s*([\w-]*)/);
    if (fence) {
      const body = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) body.push(lines[i++].slice(fence[1].length));
      i++;
      const code = esc(body.join('\n'));
      out += fence[2] === 'mermaid'
        ? `<div class="scroll diagram"><pre class="mermaid">${code}</pre></div>\n`
        : `<div class="scroll"><pre><code>${code}</code></pre></div>\n`;
      continue;
    }

    const h = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (h) {
      // Document h1 renders as h2: the section heading sits above it on the page.
      const level = Math.min(6, h[1].length + 1);
      out += `<h${level} id="${prefix}-${slug(h[2])}">${inline(h[2], prefix)}</h${level}>\n`;
      i++;
      continue;
    }

    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) { out += '<hr>\n'; i++; continue; }

    if (/^\s*>/.test(line)) {
      const body = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) body.push(lines[i++].replace(/^\s*>\s?/, ''));
      out += `<blockquote>${blocks(body, prefix)}</blockquote>\n`;
      continue;
    }

    if (/^\s*\|/.test(line) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const cells = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
      const head = cells(line);
      i += 2;
      let rows = '';
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        const r = cells(lines[i++]);
        rows += `<tr>${head.map((_, k) => `<td>${inline(r[k] ?? '', prefix)}</td>`).join('')}</tr>\n`;
      }
      out += `<div class="scroll"><table><thead><tr>${head.map((c) => `<th>${inline(c, prefix)}</th>`).join('')}</tr></thead><tbody>\n${rows}</tbody></table></div>\n`;
      continue;
    }

    if (isList(line)) {
      const r = list(lines, i, prefix);
      out += r.html;
      i = r.next;
      continue;
    }

    const para = [];
    while (i < lines.length && lines[i].trim() && !startsBlock(lines[i], lines[i + 1])) para.push(lines[i++].trim());
    if (!para.length) { para.push(lines[i++].trim()); }
    out += `<p>${inline(para.join(' '), prefix)}</p>\n`;
  }
  return out;
}

/**
 * Renders a list starting at lines[start], including nested lists and continuation lines.
 * @param {string[]} lines @param {number} start @param {string} prefix
 * @returns {{html: string, next: number}}
 */
function list(lines, start, prefix) {
  const first = lines[start].match(/^(\s*)([-*+]|\d+[.)])\s+/);
  const indent = first[1].length;
  const ordered = /\d/.test(first[2]);
  let i = start;
  let items = '';
  while (i < lines.length) {
    const m = lines[i].match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
    if (!m || m[1].length !== indent || /\d/.test(m[2]) !== ordered) break;
    const body = [m[3]];
    i++;
    // The item continues through blank lines and lines indented deeper than its marker.
    while (i < lines.length) {
      const l = lines[i];
      if (!l.trim()) {
        const nxt = lines.slice(i + 1).find((x) => x.trim());
        if (nxt && nxt.match(/^\s*/)[0].length > indent) { body.push(''); i++; continue; }
        break;
      }
      if (l.match(/^\s*/)[0].length > indent) { body.push(l.slice(Math.min(l.match(/^\s*/)[0].length, indent + 2))); i++; continue; }
      if (/^\s*(?:[-*+]|\d+[.)])\s+/.test(l)) break;
      if (/^\s*(```|#|>|\|)/.test(l)) break;
      body.push(l.trim()); // lazy continuation
      i++;
    }
    let head = body[0];
    let check = '';
    const task = head.match(/^\[([ xX])\]\s+(.*)$/);
    if (task) {
      check = `<span class="check${task[1] === ' ' ? '' : ' done'}" aria-label="${task[1] === ' ' ? 'not done' : 'done'}"></span>`;
      head = task[2];
    }
    const rest = body.slice(1);
    const firstPara = [head];
    while (rest.length && rest[0].trim() && !/^\s*(?:[-*+]|\d+[.)])\s+/.test(rest[0]) && !/^\s*(```|#|>|\|)/.test(rest[0])) firstPara.push(rest.shift().trim());
    const inner = rest.some((l) => l.trim()) ? blocks(rest, prefix) : '';
    items += `<li${check ? ' class="task"' : ''}>${check}${inline(firstPara.join(' '), prefix)}${inner}</li>\n`;
    while (i < lines.length && !lines[i].trim()) {
      const nxt = lines.slice(i).find((x) => x.trim());
      const nm = nxt && nxt.match(/^(\s*)([-*+]|\d+[.)])\s+/);
      if (nm && nm[1].length === indent) i++;
      else break;
    }
  }
  const tag = ordered ? 'ol' : 'ul';
  return { html: `<${tag}>\n${items}</${tag}>\n`, next: i };
}

// ---------- package facts ----------

/**
 * Reads the package index's header table (`| **Status** | ... |` rows) and title.
 * @param {string} readme
 * @returns {{name: string, fields: Record<string,string>}}
 */
function indexFacts(readme) {
  const name = (readme.match(/^#\s+(.+)$/m) || [])[1]?.trim() || '';
  /** @type {Record<string,string>} */
  const fields = {};
  for (const m of readme.matchAll(/^\|\s*\*\*([^*]+)\*\*\s*\|\s*(.*?)\s*\|\s*$/gm)) fields[m[1].trim().toLowerCase()] = m[2].trim();
  return { name, fields };
}

/** @param {string} status */
function statusClass(status) {
  const s = status.toLowerCase();
  if (s.includes('ready')) return 'ready';
  if (s.includes('review')) return 'review';
  if (s.includes('decision')) return 'loop';
  return 'draft';
}

/** @param {string} dir @returns {string} short commit of the package's last change, or '' */
function lastCommit(dir) {
  try {
    return execFileSync('git', ['log', '-1', '--format=%h', '--', '.'], { cwd: dir, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

/** @param {string} dir */
function uncommitted(dir) {
  try {
    return execFileSync('git', ['status', '--porcelain', '--', '.'], { cwd: dir, encoding: 'utf8' }).trim() !== '';
  } catch {
    return false;
  }
}

// ---------- page ----------

const STYLE = `
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400&family=IBM+Plex+Sans+Condensed:wght@500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
/* Layout: a design dossier. Sticky document index on the left, one long reading column. */
:root {
  --bg: #f4f6f9; --surface: #ffffff; --fg: #18202c; --muted: #5a6677; --line: #d9dfe8;
  --accent: #1f56c3; --accent-soft: #e5edfb;
  --ok: #1d7a4c; --ok-soft: #e1f3e9; --warn: #9a5b00; --warn-soft: #fbf0dc; --neutral-soft: #eceff4;
  --font-body: "IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-head: "IBM Plex Sans Condensed", "IBM Plex Sans", system-ui, sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, "Cascadia Mono", Consolas, monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg: #0e131a; --surface: #151c26; --fg: #e2e8f0; --muted: #98a4b5; --line: #263142;
  --accent: #7fa6ff; --accent-soft: #1b2944;
  --ok: #6fd19f; --ok-soft: #14301f; --warn: #f0b85a; --warn-soft: #33270f; --neutral-soft: #1d2531;
  color-scheme: dark; } }
:root[data-theme="dark"] {
  --bg: #0e131a; --surface: #151c26; --fg: #e2e8f0; --muted: #98a4b5; --line: #263142;
  --accent: #7fa6ff; --accent-soft: #1b2944;
  --ok: #6fd19f; --ok-soft: #14301f; --warn: #f0b85a; --warn-soft: #33270f; --neutral-soft: #1d2531;
  color-scheme: dark; }
body { background: var(--bg); color: var(--fg); font: 15px/1.6 var(--font-body); }
.wrap { max-width: 1180px; margin: 0 auto; padding-inline: 16px; padding-block: 24px 64px;
  display: grid; grid-template-columns: 200px minmax(0, 1fr); gap: 40px; }
header.top { grid-column: 1 / -1; display: grid; gap: 10px; border-bottom: 1px solid var(--line); padding-bottom: 20px; }
.eyebrow { font: 500 12px/1 var(--font-mono); letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
h1 { font: 600 clamp(26px, 4vw, 36px)/1.15 var(--font-head); margin: 0; text-wrap: balance; }
.facts { display: flex; flex-wrap: wrap; gap: 8px 20px; color: var(--muted); font-size: 13px; }
.facts b { color: var(--fg); font-weight: 500; }
.pill { display: inline-block; font: 500 12px/1 var(--font-mono); padding: 5px 9px; border-radius: 999px; background: var(--neutral-soft); color: var(--fg); }
.pill.ready { background: var(--ok-soft); color: var(--ok); }
.pill.review, .pill.loop { background: var(--warn-soft); color: var(--warn); }
.pill.draft { background: var(--neutral-soft); color: var(--muted); }
nav.index { position: sticky; top: calc(env(safe-area-inset-top, 0px) + 16px); align-self: start; display: grid; gap: 2px; font-size: 14px; }
nav.index a { color: var(--muted); text-decoration: none; padding: 6px 10px; border-radius: 6px; border-left: 2px solid transparent; }
nav.index a:hover, nav.index a:focus-visible { color: var(--fg); background: var(--accent-soft); outline: none; }
nav.index a.here { color: var(--accent); border-left-color: var(--accent); background: var(--accent-soft); }
main { min-width: 0; display: grid; gap: 56px; }
section.doc { min-width: 0; }
section.doc > .doc-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap;
  border-bottom: 2px solid var(--fg); padding-bottom: 8px; margin-bottom: 8px; }
section.doc > .doc-head h2 { font: 600 24px/1.2 var(--font-head); margin: 0; }
section.doc > .doc-head .src { font: 12px var(--font-mono); color: var(--muted); }
.body { max-width: 72ch; overflow-wrap: anywhere; }
.body th, .body td, .body pre { overflow-wrap: normal; }
.body h2 { font: 600 20px/1.3 var(--font-head); margin: 32px 0 8px; text-wrap: balance; }
.body h3 { font: 600 17px/1.35 var(--font-head); margin: 28px 0 6px; text-wrap: balance; }
.body h4, .body h5, .body h6 { font: 600 15px/1.4 var(--font-body); margin: 20px 0 4px; }
.body p { margin: 8px 0; }
.body ul, .body ol { margin: 8px 0; padding-left: 22px; }
.body li { margin: 3px 0; }
.body li.task { list-style: none; margin-left: -20px; display: flex; gap: 8px; align-items: baseline; }
.check { flex: none; width: 13px; height: 13px; border: 1.5px solid var(--muted); border-radius: 3px; transform: translateY(2px); }
.check.done { background: var(--ok); border-color: var(--ok); }
.body a { color: var(--accent); }
.body code { font: .9em var(--font-mono); background: var(--neutral-soft); padding: 1px 5px; border-radius: 4px; }
.body code.path { color: var(--muted); }
.body hr { border: 0; border-top: 1px solid var(--line); margin: 24px 0; }
.body blockquote { margin: 12px 0; padding: 4px 16px; border-left: 3px solid var(--accent); background: var(--surface); }
.id { font: 500 .82em var(--font-mono); color: var(--accent); background: var(--accent-soft); padding: 1px 5px; border-radius: 4px; font-variant-numeric: tabular-nums; }
.scroll { overflow-x: auto; margin: 12px 0; max-width: 100%; }
.body .scroll { max-width: min(100%, calc(100vw - 32px)); }
table { border-collapse: collapse; font-size: 14px; background: var(--surface); min-width: 60%; }
th, td { text-align: left; vertical-align: top; padding: 7px 10px; border-bottom: 1px solid var(--line); }
th { font: 600 12px/1.3 var(--font-body); text-transform: uppercase; letter-spacing: .04em; color: var(--muted); border-bottom: 1.5px solid var(--fg); white-space: nowrap; }
pre { margin: 0; padding: 12px 14px; background: var(--surface); border: 1px solid var(--line); border-radius: 6px; font: 13px/1.5 var(--font-mono); }
pre code { background: none; padding: 0; }
.diagram pre.mermaid { background: var(--surface); text-align: center; }
.note { font-size: 13px; color: var(--muted); border-top: 1px solid var(--line); padding-top: 12px; }
@media (max-width: 760px) {
  .wrap { grid-template-columns: minmax(0, 1fr); gap: 20px; }
  nav.index { position: static; display: flex; flex-wrap: wrap; gap: 4px; }
  nav.index a { border-left: 0; border: 1px solid var(--line); }
}
@media (prefers-reduced-motion: no-preference) { html { scroll-behavior: smooth; } }
</style>`;

const SCRIPT = `
<script>
// Highlight the document being read in the index.
(function () {
  var links = Array.prototype.slice.call(document.querySelectorAll('nav.index a'));
  var byId = {};
  links.forEach(function (a) { byId[a.getAttribute('href').slice(1)] = a; });
  if (!('IntersectionObserver' in window)) return;
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      links.forEach(function (a) { a.classList.remove('here'); });
      var a = byId[e.target.id];
      if (a) a.classList.add('here');
    });
  }, { rootMargin: '-20% 0px -70% 0px' });
  document.querySelectorAll('section.doc').forEach(function (s) { io.observe(s); });
})();
</script>`;

/** @param {Record<string,string>} opts */
function renderPackage(opts) {
  const dir = path.resolve(opts.dir);
  const readmePath = path.join(dir, 'README.md');
  if (!fs.existsSync(readmePath)) throw new Error(`No README.md in ${dir} — is this a design package?`);
  const { name, fields } = indexFacts(fs.readFileSync(readmePath, 'utf8'));
  const title = opts.title || name;
  const status = (fields.status || 'Draft').replace(/[<>]/g, '');
  const commit = lastCommit(dir);
  const dirty = uncommitted(dir);
  const date = new Date().toISOString().slice(0, 10);

  /** @type {[string, string, string][]} id, label, html */
  const sections = [];
  const summary = opts.summary || path.join(dir, 'review.md');
  if (fs.existsSync(summary)) sections.push(['overview', 'Overview', renderMarkdown(fs.readFileSync(summary, 'utf8'), 'overview')]);
  for (const [file, id, label] of DOCS) {
    const p = path.join(dir, file);
    if (fs.existsSync(p)) sections.push([id, label, renderMarkdown(fs.readFileSync(p, 'utf8'), id)]);
  }

  const facts = [
    `<span class="pill ${statusClass(status)}">${esc(status)}</span>`,
    fields.owner ? `<span>Owner <b>${esc(fields.owner)}</b></span>` : '',
    opts.round ? `<span>Review round <b>${esc(opts.round)}</b></span>` : '',
    `<span>Rendered <b>${date}</b>${commit ? ` from <b>${esc(commit)}</b>` : ''}${dirty ? ' (with uncommitted edits)' : ''}</span>`,
  ].filter(Boolean).join('');

  return `<title>${esc(title)}</title>
${STYLE}
<div class="wrap">
<header class="top">
  <div class="eyebrow">Design package · ${esc(path.basename(dir))}</div>
  <h1>${esc(name || title)}</h1>
  <div class="facts">${facts}</div>
</header>
<nav class="index" aria-label="Documents">
${sections.map(([id, label]) => `  <a href="#${id}">${esc(label)}</a>`).join('\n')}
</nav>
<main>
${sections.map(([id, label, html]) => `<section class="doc" id="${id}">
<div class="doc-head"><h2>${esc(label)}</h2>${id === 'overview' ? '' : `<span class="src">${esc(DOCS.find((d) => d[1] === id)[0])}</span>`}</div>
<div class="body">
${html}</div>
</section>`).join('\n')}
<p class="note">Rendered from the markdown in the repository, which stays the source of truth. Comment on anything here; the product lead collects comments into the next decision round.</p>
</main>
</div>
${SCRIPT}
`;
}

/** @param {Record<string,string>} opts */
function renderHub(opts) {
  const root = path.resolve(opts.dir);
  const pkgs = fs.readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(root, d.name, 'README.md')))
    .map((d) => {
      const { name, fields } = indexFacts(fs.readFileSync(path.join(root, d.name, 'README.md'), 'utf8'));
      return { slug: d.name, name: name || d.name, fields };
    })
    .sort((a, b) => (b.fields['last updated'] || '').localeCompare(a.fields['last updated'] || ''));
  const date = new Date().toISOString().slice(0, 10);
  const linkOf = (v) => {
    const m = (v || '').match(/https?:\/\/[^\s)>\]]+/);
    return m ? `<a href="${esc(m[0])}" target="_blank" rel="noopener">Open review</a>` : '<span class="note-inline">Not published</span>';
  };
  const rows = pkgs.map((p) => {
    const status = (p.fields.status || 'Draft').replace(/[<>]/g, '');
    return `<tr><td><b>${esc(p.name)}</b><br><code class="path">${esc(p.slug)}</code></td>
<td><span class="pill ${statusClass(status)}">${esc(status)}</span></td>
<td>${esc(p.fields.owner || '')}</td><td style="font-variant-numeric: tabular-nums">${esc(p.fields['last updated'] || '')}</td>
<td>${linkOf(p.fields['review page'])}</td></tr>`;
  }).join('\n');
  const title = opts.title || 'Design packages';

  return `<title>${esc(title)}</title>
${STYLE}
<style>.wrap.hub { grid-template-columns: minmax(0, 1fr); } .note-inline { color: var(--muted); font-size: 13px; }</style>
<div class="wrap hub">
<header class="top">
  <div class="eyebrow">Design hub · ${esc(path.basename(root))}</div>
  <h1>${esc(title)}</h1>
  <div class="facts"><span><b>${pkgs.length}</b> package${pkgs.length === 1 ? '' : 's'}</span><span>Updated <b>${date}</b></span></div>
</header>
<main>
<section class="doc" id="packages">
<div class="body" style="max-width:none">
${pkgs.length ? `<div class="scroll"><table><thead><tr><th>Initiative</th><th>Status</th><th>Owner</th><th>Last updated</th><th>Review page</th></tr></thead><tbody>
${rows}
</tbody></table></div>` : '<p>No design packages yet.</p>'}
</div>
</section>
<p class="note">Each review page is private until its owner shares it. The markdown packages in the repository are the source of truth.</p>
</main>
</div>
`;
}

// ---------- main ----------

const { cmd, opts } = parseArgs(process.argv.slice(2));
try {
  if (!opts.dir || !opts.out || !['package', 'hub'].includes(cmd)) {
    throw new Error('usage: render-review.mjs package --dir <package> --title <t> --out <file> [--round n] [--summary <file>]\n       render-review.mjs hub --dir <packages_dir> --title <t> --out <file>');
  }
  const html = cmd === 'package' ? renderPackage(opts) : renderHub(opts);
  fs.mkdirSync(path.dirname(path.resolve(opts.out)), { recursive: true });
  fs.writeFileSync(opts.out, html, 'utf8');
  console.log(`wrote ${opts.out} (${Math.round(html.length / 1024)} KB)`);
} catch (err) {
  console.error(String(err.message || err));
  process.exit(1);
}
