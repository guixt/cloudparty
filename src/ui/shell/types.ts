import { useStore } from 'zustand';
import type { ShellController } from './controller';

export type Props = { shell: ShellController };

export const useShell = <T,>(shell: ShellController, selector: (s: ReturnType<ShellController['ui']['getState']>) => T): T => useStore(shell.ui, selector);
