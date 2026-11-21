/** Export nach Blender: .glb (Option A + B) und Hilfsskript (Option C). */
import { worldFileName } from '../persistence/io';
import type { GameContext } from '../../core/context';
import { buildBlenderScript } from './blenderScript';
import { exportGlb, type ExportResult } from './gltf';

export { buildBlenderScript } from './blenderScript';
export { exportGlb, selectExportEntities, entityExtras } from './gltf';
export { exportMaterialPlan } from './materialPlan';

function download(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export interface BlenderExportOptions {
  ids?: readonly string[];
  /** Zusätzlich das Blender-Skript (.py) herunterladen. */
  withScript?: boolean;
}

/** Exportiert und löst die Downloads aus. */
export async function exportForBlender(ctx: GameContext, options: BlenderExportOptions = {}): Promise<ExportResult> {
  const result = await exportGlb(ctx, { ids: options.ids });
  download(result.blob, result.fileName);
  if (options.withScript) {
    const world = ctx.store.getState().toWorldSpec();
    const script = buildBlenderScript({ glbFile: result.fileName, world });
    download(new Blob([script], { type: 'text/x-python' }), result.fileName.replace(/\.glb$/, '') + '-blender.py');
  }
  return result;
}

export { worldFileName };
