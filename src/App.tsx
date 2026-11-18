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
import { SLOT_DEFAULT, applySlotWidth, loadSlotWidth, saveSlotWidth, widthFromPointer, type ResizableSlot } from './ui/slotWidth';
import './styles.css';

const ui = createUiRegistry();
const SLOTS: UiSlot[] = ['top-left', 'top-right', 'left', 'right', 'bottom-left', 'toolbar', 'overlay'];

interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error';
}

/** Griff am inneren Rand einer seitlichen Leiste: mit der Maus ziehen verbreitert oder verschmälert sie, Doppelklick setzt zurück. */
function SlotResizer({ slot }: { slot: ResizableSlot }) {
  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    document.body.classList.add('cp-resizing');
    let last = loadSlotWidth(slot);
    const move = (ev: PointerEvent) => {
      last = widthFromPointer(slot, ev.clientX, window.innerWidth);
      applySlotWidth(slot, last);
    };
    const up = (ev: PointerEvent) => {
      target.releasePointerCapture?.(ev.pointerId);
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
      document.body.classList.remove('cp-resizing');
      saveSlotWidth(slot, last);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  };
  return (
    <div
      className={`cp-slot-resizer cp-slot-resizer-${slot}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={slot === 'left' ? 'Breite der linken Leiste' : 'Breite der rechten Leiste'}
      title="Ziehen: Breite ändern · Doppelklick: zurücksetzen"
      data-testid={`resize-${slot}`}
      onPointerDown={onDown}
      onDoubleClick={() => {
        applySlotWidth(slot, SLOT_DEFAULT[slot]);
        saveSlotWidth(slot, SLOT_DEFAULT[slot]);
      }}
    />
  );
}

function Slots({ ctx }: { ctx: GameContext }) {
  useEffect(() => {
    const apply = () => {
      for (const slot of ['left', 'right'] as const) applySlotWidth(slot, loadSlotWidth(slot));
    };
    apply();
    window.addEventListener('resize', apply);
    return () => window.removeEventListener('resize', apply);
  }, []);
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
          {(slot === 'left' || slot === 'right') && <SlotResizer slot={slot} />}
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
