/**
 * Layout: Canvas, HTML-Ebene darüber und UI-Slots. VERTRAG: nur der Koordinator ändert diese Datei.
 * Module hängen ihre Oberfläche über ctx.ui.register(...) ein (siehe src/core/ui.ts).
 */
import { useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import type { GameContext } from './core/context';
import { createUiRegistry, type UiPanel, type UiSlot } from './core/ui';
import { startGame, type Game } from './engine/bootstrap';
import { modules } from './modules';
import './styles.css';

const ui = createUiRegistry();
const SLOTS: UiSlot[] = ['top-left', 'top-right', 'left', 'right', 'bottom-left', 'toolbar', 'overlay'];

interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error';
}

function Slots({ ctx }: { ctx: GameContext }) {
  const panels = useStore(ui.store, (state) => state.panels);
  const mode = useStore(ctx.store, (state) => state.mode);
  const bySlot = (slot: UiSlot): UiPanel[] => panels.filter((panel) => panel.slot === slot);
  return (
    <div className={`cp-ui cp-mode-${mode}`} data-mode={mode}>
      {SLOTS.map((slot) => (
        <div key={slot} className={`cp-slot cp-slot-${slot}`} data-slot={slot}>
          {bySlot(slot).map((panel) => (
            <panel.component key={panel.id} ctx={ctx} />
          ))}
        </div>
      ))}
    </div>
  );
}

function Toasts({ ctx }: { ctx: GameContext }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  useEffect(() => {
    let next = 1;
    return ctx.bus.on('ui.toast', ({ text, kind }) => {
      const id = next++;
      setToasts((list) => [...list, { id, text, kind: kind ?? 'info' }]);
      window.setTimeout(() => setToasts((list) => list.filter((toast) => toast.id !== id)), 4000);
    });
  }, [ctx]);
  return (
    <div className="cp-toasts">
      {toasts.map((toast) => (
        <div key={toast.id} className={`cp-toast cp-toast-${toast.kind}`}>
          {toast.text}
        </div>
      ))}
    </div>
  );
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [ctx, setCtx] = useState<GameContext | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let game: Game | null = null;
    let cancelled = false;
    startGame(canvasRef.current!, overlayRef.current!, ui, modules)
      .then((started) => {
        if (cancelled) {
          started.dispose();
          return;
        }
        game = started;
        setCtx(started.ctx);
      })
      .catch((reason: Error) => {
        console.error(reason);
        window.__cloudparty.error = reason.message;
        setError(reason.message);
      });
    return () => {
      cancelled = true;
      game?.dispose();
    };
  }, []);

  return (
    <div className="cp-root">
      <canvas ref={canvasRef} className="cp-canvas" data-testid="world-canvas" />
      <div ref={overlayRef} className="cp-overlay-root" />
      {ctx && <Slots ctx={ctx} />}
      {ctx && <Toasts ctx={ctx} />}
      {!ctx && !error && <div className="cp-loading">Cloudparty lädt …</div>}
      {error && <div className="cp-loading cp-error">Start fehlgeschlagen: {error}</div>}
    </div>
  );
}

export default App;
