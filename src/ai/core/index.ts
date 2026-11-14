/**
 * STUB des Fundaments – Paket 13 (KI-Kern & Werkzeuge) ersetzt diese Datei.
 * Exportiert: `getAssistant(): AssistantApi | null`, `askClaude: AskClaude`, `hasAiKey(): boolean`
 * und das Modul (default export, id `ai-core`), das beim Start `getAssistant()` verfügbar macht.
 */
import type { AskClaude, AssistantApi } from '../api';
import type { GameModule } from '../../core/context';

let assistant: AssistantApi | null = null;
export function getAssistant(): AssistantApi | null {
  return assistant;
}
export const askClaude: AskClaude = async () => {
  throw new Error('Die KI ist noch nicht verfügbar.');
};
export function hasAiKey(): boolean {
  return false;
}

const mod: GameModule = {
  id: 'ai-core',
  init() {
    assistant = null;
  },
};
export default mod;
