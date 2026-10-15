import { Fragment, type ReactNode } from 'react';
import { GLOSSARY_BY_ID } from '../../content/glossary';

/** Hover/focus/tap glossary term. */
export function Term({ id, children }: { id: string; children?: ReactNode }) {
  const t = GLOSSARY_BY_ID.get(id);
  if (!t) return <>{children ?? id}</>;
  return (
    <span className="term" tabIndex={0} role="button" aria-label={`${t.term}: ${t.def}`} onClick={(e) => e.currentTarget.focus()}>
      {children ?? t.term}
      <span className="term-pop" role="tooltip">
        <b>{t.term}</b>
        {t.def}
      </span>
    </span>
  );
}

const TOKEN = /(\*\*[^*]+\*\*|\[\[[^\]]+\]\])/g;

function inline(text: string, keyBase: string): ReactNode[] {
  return text.split(TOKEN).filter((s) => s !== '').map((part, i) => {
    if (part.startsWith('**')) return <b key={`${keyBase}${i}`}>{inline(part.slice(2, -2), `${keyBase}${i}b`)}</b>; // glossary terms may sit inside bold text
    if (part.startsWith('[[')) {
      const [id, label] = part.slice(2, -2).split('|');
      return <Term key={`${keyBase}${i}`} id={id!}>{label}</Term>;
    }
    return <Fragment key={`${keyBase}${i}`}>{part}</Fragment>;
  });
}

/** Minimal markup: paragraphs, "- " bullets, "1. " lists, **bold**, [[term|label]]. */
export function Rich({ text, className }: { text: string; className?: string }) {
  const blocks = text.split(/\n\n+/);
  return (
    <div className={`rich ${className ?? ''}`}>
      {blocks.map((b, bi) => {
        const lines = b.split('\n');
        if (lines.every((l) => /^- /.test(l))) {
          return <ul key={bi}>{lines.map((l, i) => <li key={i}>{inline(l.slice(2), `${bi}-${i}-`)}</li>)}</ul>;
        }
        if (lines.every((l) => /^\d+\. /.test(l))) {
          return <ol key={bi}>{lines.map((l, i) => <li key={i}>{inline(l.replace(/^\d+\. /, ''), `${bi}-${i}-`)}</li>)}</ol>;
        }
        // mixed: a paragraph followed by bullets
        const first = lines[0]!;
        if (lines.length > 1 && lines.slice(1).every((l) => /^- /.test(l))) {
          return (
            <Fragment key={bi}>
              <p>{inline(first, `${bi}-p-`)}</p>
              <ul>{lines.slice(1).map((l, i) => <li key={i}>{inline(l.slice(2), `${bi}-${i}-`)}</li>)}</ul>
            </Fragment>
          );
        }
        return <p key={bi}>{lines.map((l, i) => <Fragment key={i}>{i > 0 && <br />}{inline(l, `${bi}-${i}-`)}</Fragment>)}</p>;
      })}
    </div>
  );
}

/** Glossary ids referenced in a piece of markup. */
export function termsIn(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)) if (!out.includes(m[1]!)) out.push(m[1]!);
  return out;
}

/** Strip markup to plain text (for linting and accessibility labels). */
export function plain(text: string): string {
  return text.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2').replace(/\[\[([^\]]+)\]\]/g, (_, id: string) => GLOSSARY_BY_ID.get(id)?.term ?? id).replace(/\*\*/g, '');
}
