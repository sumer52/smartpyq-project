import React, { useMemo } from 'react';

// Minimal, dependency-free markdown renderer for chat answers.
// Supports: headings, bold/italic/inline code, fenced code blocks with a
// copy button, unordered/ordered lists, tables, and links. Everything is
// rendered through React elements — user/AI content is never injected as
// HTML, so XSS is structurally impossible here.

function InlineText({ text }) {
  const nodes = useMemo(() => {
    const parts = [];
    // Order matters: inline code first (protects its content from further parsing).
    const regex = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(\[[^\]\n]+\]\((?:https?:\/\/|\/)[^\s)]+\))/g;
    let lastIndex = 0;
    let match;
    let key = 0;
    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
      const token = match[0];
      if (token.startsWith('`')) {
        parts.push(<code key={key++} className="px-1.5 py-0.5 rounded bg-white/10 text-purple-200 text-[0.85em] font-mono">{token.slice(1, -1)}</code>);
      } else if (token.startsWith('**')) {
        parts.push(<strong key={key++} className="font-semibold text-white">{token.slice(2, -2)}</strong>);
      } else if (token.startsWith('*')) {
        parts.push(<em key={key++} className="italic">{token.slice(1, -1)}</em>);
      } else {
        const label = token.slice(1, token.indexOf(']'));
        const href = token.slice(token.indexOf('(') + 1, -1);
        parts.push(<a key={key++} href={href} target="_blank" rel="noopener noreferrer" className="text-purple-300 underline underline-offset-2 hover:text-purple-200">{label}</a>);
      }
      lastIndex = match.index + token.length;
    }
    if (lastIndex < text.length) parts.push(text.slice(lastIndex));
    return parts;
  }, [text]);
  return <>{nodes}</>;
}

function CodeBlock({ code, lang }) {
  const [copied, setCopied] = React.useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  };
  return (
    <div className="my-2 rounded-lg border border-white/10 overflow-hidden bg-black/40">
      <div className="flex items-center justify-between px-3 py-1.5 bg-white/5 border-b border-white/10">
        <span className="text-[11px] uppercase tracking-wider text-gray-400">{lang || 'code'}</span>
        <button
          type="button"
          onClick={onCopy}
          className="text-[11px] text-gray-300 hover:text-white transition-colors focus:outline-hidden"
          aria-label="Copy code"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 text-xs leading-relaxed"><code className="font-mono text-purple-100 whitespace-pre">{code}</code></pre>
    </div>
  );
}

export default function ChatMarkdown({ content }) {
  const blocks = useMemo(() => {
    const out = [];
    const lines = String(content || '').split('\n');
    let i = 0;
    let key = 0;
    while (i < lines.length) {
      const line = lines[i];
      // Fenced code block
      const fence = line.match(/^```(\w*)\s*$/);
      if (fence) {
        const lang = fence[1] || '';
        const codeLines = [];
        i += 1;
        while (i < lines.length && !/^```\s*$/.test(lines[i])) {
          codeLines.push(lines[i]);
          i += 1;
        }
        i += 1; // skip closing fence
        out.push(<CodeBlock key={key++} code={codeLines.join('\n')} lang={lang} />);
        continue;
      }
      // Table: header row + separator row
      if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
        const parseRow = (row) => row.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
        const headers = parseRow(line);
        i += 2;
        const rows = [];
        while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
          rows.push(parseRow(lines[i]));
          i += 1;
        }
        out.push(
          <div key={key++} className="my-2 overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr>{headers.map((h, hi) => <th key={hi} className="border border-white/10 bg-white/5 px-2 py-1.5 text-left font-semibold text-white">{h}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map((r, ri) => (
                  <tr key={ri}>{r.map((c, ci) => <td key={ci} className="border border-white/10 px-2 py-1.5 text-gray-200"><InlineText text={c} /></td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        continue;
      }
      // Headings
      const heading = line.match(/^(#{1,4})\s+(.*)$/);
      if (heading) {
        const level = heading[1].length;
        const cls = level <= 2 ? 'text-base font-bold text-white' : 'text-sm font-semibold text-white';
        out.push(<p key={key++} className={`${cls} mt-3 mb-1 first:mt-0`}><InlineText text={heading[2]} /></p>);
        i += 1;
        continue;
      }
      // Unordered list (collect consecutive items)
      if (/^\s*[-*•]\s+/.test(line)) {
        const items = [];
        while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) {
          items.push(lines[i].replace(/^\s*[-*•]\s+/, ''));
          i += 1;
        }
        out.push(
          <ul key={key++} className="my-1.5 space-y-1 list-disc list-outside ml-4">
            {items.map((it, ii) => <li key={ii} className="text-sm text-gray-100"><InlineText text={it} /></li>)}
          </ul>
        );
        continue;
      }
      // Ordered list
      if (/^\s*\d+[.)]\s+/.test(line)) {
        const items = [];
        while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
          items.push(lines[i].replace(/^\s*\d+[.)]\s+/, ''));
          i += 1;
        }
        out.push(
          <ol key={key++} className="my-1.5 space-y-1 list-decimal list-outside ml-4">
            {items.map((it, ii) => <li key={ii} className="text-sm text-gray-100"><InlineText text={it} /></li>)}
          </ol>
        );
        continue;
      }
      // Blank line
      if (!line.trim()) {
        i += 1;
        continue;
      }
      // Paragraph (collect until blank line / block start)
      const paraLines = [];
      while (
        i < lines.length && lines[i].trim() &&
        !/^```/.test(lines[i]) && !/^#{1,4}\s/.test(lines[i]) &&
        !/^\s*[-*•]\s+/.test(lines[i]) && !/^\s*\d+[.)]\s+/.test(lines[i]) &&
        !/^\s*\|.*\|\s*$/.test(lines[i])
      ) {
        paraLines.push(lines[i]);
        i += 1;
      }
      out.push(<p key={key++} className="text-sm text-gray-100 leading-relaxed whitespace-pre-wrap"><InlineText text={paraLines.join('\n')} /></p>);
    }
    return out;
  }, [content]);

  return <div className="space-y-0.5">{blocks}</div>;
}
