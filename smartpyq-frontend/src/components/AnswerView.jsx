import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogClose } from '@/components/ui/dialog';
import {
  PhotoIcon, DocumentTextIcon, DocumentIcon, ArrowsPointingOutIcon,
  MinusIcon, PlusIcon, ArrowTopRightOnSquareIcon, XMarkIcon,
} from '@heroicons/react/24/outline';

/**
 * AnswerView — renders a teacher answer in its ORIGINAL format.
 *
 *  text  -> FormattedText: paragraphs, bullets, numbered lists, quotes,
 *           indents and line breaks (safe rendering, no HTML injection).
 *  image -> inline thumbnail + lightbox with zoom controls (original file).
 *  pdf   -> "View document" + inline iframe modal + open-in-new-tab fallback.
 *
 * The backend never converts uploaded files to text, and this component never
 * renders file answers as extracted text.
 */

// ---------------------------------------------------------------------------
// Safe formatted-text renderer: paragraphs, bullets, numbered lists, quotes,
// indents, inline bold/italic/code. No dangerouslySetInnerHTML anywhere.
// ---------------------------------------------------------------------------

// Inline markdown -> React nodes (**bold**, *italic*, `code`). Tokenized with a
// single regex so nesting cannot trick the parser; nothing is interpreted as HTML.
const INLINE_RE = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`)/g;
const renderInline = (text) => {
  const parts = String(text).split(INLINE_RE).filter(p => p !== '' && p !== undefined);
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**') && p.length > 4) {
      return <strong key={i} className="font-semibold text-white">{p.slice(2, -2)}</strong>;
    }
    if (p.startsWith('`') && p.endsWith('`') && p.length > 2) {
      return <code key={i} className="px-1 py-0.5 rounded bg-white/10 text-indigo-200 text-[0.85em] font-mono">{p.slice(1, -1)}</code>;
    }
    if (p.startsWith('*') && p.endsWith('*') && p.length > 2) {
      return <em key={i} className="italic text-gray-200">{p.slice(1, -1)}</em>;
    }
    return p;
  });
};

export const FormattedText = ({ text }) => {
  if (!text) return null;
  const lines = String(text).replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let para = [];
  let bullets = [];
  let numbered = [];

  const flush = () => {
    if (para.length) { blocks.push({ type: 'p', lines: [...para] }); para = []; }
    if (bullets.length) { blocks.push({ type: 'ul', items: [...bullets] }); bullets = []; }
    if (numbered.length) { blocks.push({ type: 'ol', items: [...numbered] }); numbered = []; }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-*\u2022]\s+(.*)$/);
    const num = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
    const quote = line.match(/^>\s?(.*)$/);
    if (bullet) {
      if (para.length || numbered.length) flush();
      bullets.push(bullet[1]);
    } else if (num) {
      if (para.length || bullets.length) flush();
      numbered.push(num[2]);
    } else if (quote) {
      flush();
      blocks.push({ type: 'quote', text: quote[1] });
    } else if (line.trim() === '') {
      flush();
    } else if (/^\s{2,}\S/.test(raw) && !para.length && !bullets.length && !numbered.length) {
      flush();
      blocks.push({ type: 'indent', text: raw.trim() });
    } else {
      if (bullets.length || numbered.length) flush();
      para.push(line);
    }
  }
  flush();

  return (
    <div className="space-y-3 text-white text-sm leading-relaxed">
      {blocks.map((b, i) => {
        if (b.type === 'ul') return (
          <ul key={i} className="list-disc pl-5 space-y-1.5 marker:text-indigo-400">
            {b.items.map((it, j) => <li key={j}>{renderInline(it)}</li>)}
          </ul>
        );
        if (b.type === 'ol') return (
          <ol key={i} className="list-decimal pl-5 space-y-1.5 marker:text-indigo-400">
            {b.items.map((it, j) => <li key={j}>{renderInline(it)}</li>)}
          </ol>
        );
        if (b.type === 'quote') return (
          <blockquote key={i} className="border-l-2 border-indigo-500/50 pl-3 text-gray-300 italic">{renderInline(b.text)}</blockquote>
        );
        if (b.type === 'indent') return <p key={i} className="pl-6 text-gray-200">{renderInline(b.text)}</p>;
        return <p key={i}>{b.lines.map((l, j) => <React.Fragment key={j}>{j > 0 && <br />}{renderInline(l)}</React.Fragment>)}</p>;
      })}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Image lightbox with zoom (buttons + wheel), pan-reset, ESC/backdrop close.
// Built on shadcn Dialog (Radix): focus trap, scroll lock, aria wiring.
// ---------------------------------------------------------------------------
const ImageLightbox = ({ src, name, open, onOpenChange }) => {
  const [zoom, setZoom] = useState(1);
  // Reset zoom each time the lightbox opens.
  useEffect(() => { if (open) setZoom(1); }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideClose className="flex max-w-[95vw] flex-col gap-0 p-0 sm:max-w-[95vw]"
        aria-describedby={undefined}>
        <div className="flex items-center justify-between px-4 py-3 bg-black/60 rounded-t-2xl">
          <DialogTitle className="text-gray-300 text-sm font-normal truncate max-w-[50%]">{name || 'Answer image'}</DialogTitle>
          <div className="flex items-center gap-2">
            <button onClick={() => setZoom(z => Math.max(0.5, +(z - 0.25).toFixed(2)))}
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white" aria-label="Zoom out"><MinusIcon className="h-4 w-4" /></button>
            <span className="text-gray-300 text-xs w-12 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom(z => Math.min(4, +(z + 0.25).toFixed(2)))}
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white" aria-label="Zoom in"><PlusIcon className="h-4 w-4" /></button>
            <a href={src} target="_blank" rel="noreferrer"
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white" aria-label="Open original"><ArrowTopRightOnSquareIcon className="h-4 w-4" /></a>
            <DialogClose
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-400/60"
              aria-label="Close image viewer"><XMarkIcon className="h-4 w-4" /></DialogClose>
          </div>
        </div>
        <div className="flex-1 overflow-auto flex items-start justify-center p-4 min-h-[60vh]"
          onWheel={(e) => { if (e.ctrlKey) { e.preventDefault(); setZoom(z => Math.min(4, Math.max(0.5, +(z - e.deltaY * 0.002).toFixed(2)))); } }}>
          <img src={src} alt={name || 'Teacher answer'} style={{ transform: `scale(${zoom})` }}
            className="max-w-full origin-top transition-transform duration-150 rounded-lg shadow-2xl" />
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ---------------------------------------------------------------------------
// PDF modal: inline iframe preview + open-in-new-tab fallback.
// Built on shadcn Dialog (Radix): focus trap, scroll lock, aria wiring.
// ---------------------------------------------------------------------------
const PdfModal = ({ src, name, open, onOpenChange }) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideClose className="flex max-w-[95vw] flex-col gap-0 p-0 sm:max-w-[95vw]"
        aria-describedby={undefined}>
        <div className="flex items-center justify-between px-4 py-3 bg-black/60 rounded-t-2xl">
          <DialogTitle className="text-gray-300 text-sm font-normal truncate max-w-[50%]">{name || 'Answer document'}</DialogTitle>
          <div className="flex items-center gap-2">
            <a href={src} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs">
              <ArrowTopRightOnSquareIcon className="h-4 w-4" /> Open in new tab
            </a>
            <DialogClose
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-400/60"
              aria-label="Close document viewer"><XMarkIcon className="h-4 w-4" /></DialogClose>
          </div>
        </div>
        <div className="flex-1 p-4 min-h-[70vh]">
          <iframe src={src} title={name || 'Answer document'} className="w-full h-full rounded-lg bg-white" />
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ---------------------------------------------------------------------------
// AnswerView — the main component.
//   answer: { answer_type, answer_text, answer_url, answer_file_name, ... }
//   answerUrl: absolute URL for file answers (api.answerFileUrl(qid))
// ---------------------------------------------------------------------------
const AnswerView = ({ answer, answerUrl }) => {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);

  if (!answer || !answer.answer_type) {
    return (
      <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-gray-500 text-sm italic">
        No teacher answer has been published for this question yet.
      </div>
    );
  }

  if (answer.answer_type === 'text') {
    return (
      <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4">
        <p className="text-green-400 text-xs font-semibold mb-2 flex items-center gap-1.5">
          <DocumentTextIcon className="h-4 w-4" /> ANSWER
        </p>
        <FormattedText text={answer.answer_text} />
      </div>
    );
  }

  if (answer.answer_type === 'image') {
    const src = answerUrl;
    return (
      <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4">
        <p className="text-green-400 text-xs font-semibold mb-3 flex items-center gap-1.5">
          <PhotoIcon className="h-4 w-4" /> ANSWER · uploaded image
        </p>
        <button onClick={() => setLightboxOpen(true)} className="group block w-full" aria-label="View answer image">
          <div className="relative rounded-lg overflow-hidden border border-white/10 bg-white/5 max-h-80">
            <img src={src} alt={answer.answer_file_name || 'Teacher answer'}
              className="w-full h-full object-contain max-h-80 group-hover:scale-[1.02] transition-transform duration-200" />
            <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors">
              <span className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/60 text-white text-xs">
                <ArrowsPointingOutIcon className="h-4 w-4" /> Click to zoom
              </span>
            </div>
          </div>
        </button>
        <div className="mt-2 flex items-center justify-between text-[11px] text-gray-500">
          <span className="truncate max-w-[70%]">{answer.answer_file_name}</span>
          {answer.answer_file_size ? <span>{(answer.answer_file_size / 1024).toFixed(0)} KB</span> : null}
        </div>
        <ImageLightbox src={src} name={answer.answer_file_name}
          open={lightboxOpen} onOpenChange={setLightboxOpen} />
      </div>
    );
  }

  if (answer.answer_type === 'pdf') {
    const src = answerUrl;
    return (
      <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4">
        <p className="text-green-400 text-xs font-semibold mb-3 flex items-center gap-1.5">
          <DocumentIcon className="h-4 w-4" /> ANSWER · document (PDF)
        </p>
        <button onClick={() => setPdfOpen(true)}
          className="w-full flex items-center gap-3 p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors text-left">
          <span className="p-3 rounded-lg bg-red-500/20 text-red-300"><DocumentIcon className="h-6 w-6" /></span>
          <span className="flex-1 min-w-0">
            <span className="block text-white text-sm font-medium truncate">{answer.answer_file_name || 'Answer document'}</span>
            <span className="block text-gray-500 text-xs mt-0.5">
              PDF document{answer.answer_file_size ? ` · ${(answer.answer_file_size / (1024 * 1024)).toFixed(1)} MB` : ''} · click to preview
            </span>
          </span>
          <ArrowTopRightOnSquareIcon className="h-4 w-4 text-gray-400" />
        </button>
        <PdfModal src={src} name={answer.answer_file_name}
          open={pdfOpen} onOpenChange={setPdfOpen} />
      </div>
    );
  }

  return null;
};

export default AnswerView;
