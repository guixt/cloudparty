import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useStore } from 'zustand';
import type { PanelProps } from '../core/ui';
import { MAX_CHAT_LENGTH } from '../../shared/protocol';
import { netStore } from './netStore';
import './net.css';

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
}

/** „Local Chat" unten links. */
export function ChatPanel({ ctx }: PanelProps) {
  const messages = useStore(netStore, (s) => s.messages);
  const [collapsed, setCollapsed] = useState(false);
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, collapsed]);

  // Enter in der Welt fokussiert die Eingabe.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Enter' || e.repeat || isTyping(e.target)) return;
      e.preventDefault();
      if (inputRef.current) inputRef.current.focus();
      else {
        setCollapsed(false);
        setTimeout(() => inputRef.current?.focus(), 0);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation(); // Spielsteuerung (WASD …) soll beim Tippen nichts auslösen
    if (e.key === 'Enter') {
      const value = text.trim();
      if (value) ctx.bus.emit('chat.send', { text: value });
      setText('');
    } else if (e.key === 'Escape') {
      inputRef.current?.blur();
      ctx.canvas.focus();
    }
  };

  return (
    <div className="cp-panel cpn-chat" data-testid="chat-panel">
      <div className="cpn-chat-head" onClick={() => setCollapsed((c) => !c)} title={collapsed ? 'Aufklappen' : 'Einklappen'}>
        <span className="cp-heading">Local Chat</span>
        <span className="cp-muted">{collapsed ? '▴' : '▾'}</span>
      </div>
      {!collapsed && (
        <>
          <div className="cpn-chat-list" ref={listRef}>
            {messages.length === 0 && <div className="cp-muted cpn-chat-empty">Noch keine Nachrichten. Enter drücken zum Schreiben.</div>}
            {messages.map((m, i) => (
              <div key={`${m.ts}-${i}`} className={`cpn-line cpn-line-${m.kind}`}>
                {m.kind === 'system' ? (
                  <span>{m.text}</span>
                ) : (
                  <>
                    <span className="cpn-line-name">[{m.name}]</span>: <span>{m.text}</span>
                  </>
                )}
              </div>
            ))}
          </div>
          <input
            ref={inputRef}
            className="cp-input cpn-chat-input"
            value={text}
            maxLength={MAX_CHAT_LENGTH}
            placeholder="Nachricht … (Enter)"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            onKeyUp={(e) => e.stopPropagation()}
          />
        </>
      )}
    </div>
  );
}
