'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatDateTime } from '../lib/format.js';

/** Notes with @mentions. Typing "@" suggests teammates from TEAM_MEMBERS. */
export default function CandidateNotes({ candidateId, notes, team }) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [mention, setMention] = useState(null); // { query, start }
  const [active, setActive] = useState(0);
  const ref = useRef(null);

  const suggestions = useMemo(() => {
    if (!mention) return [];
    const q = mention.query.toLowerCase();
    return team.filter((m) => m.handle.startsWith(q) || m.name.toLowerCase().includes(q)).slice(0, 6);
  }, [mention, team]);

  function onChange(e) {
    const value = e.target.value;
    setText(value);
    const caret = e.target.selectionStart;
    const m = /(^|[^\w@])@([\w.-]*)$/.exec(value.slice(0, caret));
    setMention(m ? { query: m[2], start: caret - m[2].length - 1 } : null);
    setActive(0);
  }

  function pick(member) {
    const el = ref.current;
    const caret = el.selectionStart;
    const next = `${text.slice(0, mention.start)}@${member.handle} ${text.slice(caret)}`;
    setText(next);
    setMention(null);
    requestAnimationFrame(() => {
      const pos = mention.start + member.handle.length + 2;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  }

  function onKeyDown(e) {
    if (mention && suggestions.length) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((a) => (a + 1) % suggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((a) => (a - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        pick(suggestions[active]);
        return;
      }
      if (e.key === 'Escape') {
        setMention(null);
        return;
      }
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
  }

  async function submit(e) {
    e?.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(`/api/candidates/${candidateId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const b = await res.json().catch(() => ({}));
      if (!res.ok) return setError(b.error || 'Could not save the note.');
      setText('');
      if (b.note?.mentions?.length) {
        setInfo(
          `Mentioned ${b.note.mentions.map((h) => `@${h}`).join(', ')}` +
            (b.notified ? ` · ${b.notified} email notification${b.notified === 1 ? '' : 's'} sent` : ' · shows in their Mentions list'),
        );
      }
      router.refresh();
    } catch {
      setError('Network error.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(noteId) {
    if (!window.confirm('Delete this note?')) return;
    await fetch(`/api/candidates/${candidateId}/notes?noteId=${encodeURIComponent(noteId)}`, { method: 'DELETE' });
    router.refresh();
  }

  const sorted = [...notes].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <section className="card" id="notes">
      <div className="card-head">
        <h3>Notes</h3>
        <span className="muted small">{notes.length}</span>
      </div>
      <div className="card-body stack">
        <form onSubmit={submit} className="stack-sm" style={{ position: 'relative' }}>
          <textarea
            ref={ref}
            className="textarea"
            rows={3}
            placeholder={`Add a note… type @ to tag someone${team[0] ? ` (e.g. “@${team[0].handle} worth a look”)` : ''}`}
            value={text}
            onChange={onChange}
            onKeyDown={onKeyDown}
            onBlur={() => setTimeout(() => setMention(null), 150)}
            aria-label="New note"
          />
          {mention && suggestions.length > 0 && (
            <div className="mention-pop card" role="listbox">
              {suggestions.map((m, i) => (
                <button
                  type="button"
                  key={m.handle}
                  className={i === active ? 'on' : ''}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(m);
                  }}
                  role="option"
                  aria-selected={i === active}
                >
                  <strong>@{m.handle}</strong> <span className="muted">{m.name}</span>
                </button>
              ))}
            </div>
          )}
          <div className="row-between">
            <span className="hint">Ctrl/⌘ + Enter to save</span>
            <button className="btn btn-sm btn-primary" type="submit" disabled={busy || !text.trim()}>
              {busy ? 'Saving…' : 'Add note'}
            </button>
          </div>
          {error && <span className="error-text">{error}</span>}
          {info && <span className="small muted">{info}</span>}
        </form>
        {sorted.length > 0 && (
          <div className="notes-list">
            {sorted.map((n) => (
              <div key={n.id} className="note">
                <div className="note-meta">
                  <span>
                    <strong style={{ color: 'var(--text)' }}>{n.authorName || n.author}</strong> · {formatDateTime(n.createdAt)}
                  </span>
                  <button className="link-btn small" onClick={() => remove(n.id)} title="Delete note">
                    Delete
                  </button>
                </div>
                <div className="note-text">{highlight(n.text, n.mentions)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function highlight(text, mentions = []) {
  if (!mentions.length) return text;
  const set = new Set(mentions);
  return text.split(/(@[a-z0-9._-]+)/gi).map((part, i) => {
    const h = part.startsWith('@') ? part.slice(1).toLowerCase().replace(/[._-]+$/, '') : null;
    return h && set.has(h) ? (
      <span key={i} className="mention">
        {part}
      </span>
    ) : (
      part
    );
  });
}
