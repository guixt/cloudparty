/**
 * KI-Werkzeuge (Claude Tool Use): Schemas, Grenzen und Typen. Handler: src/ai/core (Registry: registry.ts).
 * Neues Werkzeug: Schema in die passende Gruppen-Datei, Name in AiToolName (types.ts) und in TOOL_ORDER (unten) eintragen.
 */
import type { AiToolDefinition, AiToolName } from './types';
import { coreToolDefs } from './core';
import { groupToolDefs } from './groups';
import { libraryToolDefs } from './library';
import { graphToolDefs } from './graph';
import { planToolDefs } from './plan';
import { visionToolDefs } from './vision';
import { buildToolDefs } from './build';
import { imageToolDefs } from './images';
import { brickToolDefs } from './bricks';
import { scriptTestToolDefs } from './scriptTest';
import { placeToolDefs } from './place';
import { freeformToolDefs } from './freeform';

export * from './limits';
export * from './types';

/**
 * Reihenfolge der Werkzeuge in der API-Anfrage. ACHTUNG: Die Reihenfolge gehört zum Prompt-Cache der API;
 * Änderungen (auch Umsortieren) machen den Cache ungültig.
 */
export const TOOL_ORDER: readonly AiToolName[] = [
  'get_world',
  'add_entity',
  'update_entity',
  'remove_entity',
  'set_environment',
  'set_script',
  'set_media',
  'move_avatar',
  'say',
  'group_entities',
  'ungroup',
  'library_list',
  'library_place',
  'library_save',
  'set_graph',
  'plan_create',
  'plan_get',
  'plan_update_node',
  'plan_add_node',
  'plan_connect',
  'plan_edit',
  'plan_remove_node',
  'plan_complete_node',
  'look',
  'add_wall',
  'add_beam',
  'array',
  'clone_group',
  'get_bounds',
  'surface_height_at',
  'search_images',
  'add_bricks',
  'fill_bricks',
  'bricks_profile',
  'check_overlaps',
  'script_log',
  'script_test',
  'use_texture',
  'use_image',
  'place_relative',
  'align_entities',
  'fit_to_opening',
  'verify',
  'find_free_spot',
  'what_changed',
  'add_curved_wall',
  'add_lathe',
  'add_surface',
  'add_wavy_wall',
  'update_freeform',
];

function assemble(): AiToolDefinition[] {
  const byName = new Map<string, AiToolDefinition>();
  for (const def of [...coreToolDefs, ...groupToolDefs, ...libraryToolDefs, ...graphToolDefs, ...planToolDefs, ...visionToolDefs, ...buildToolDefs, ...imageToolDefs, ...brickToolDefs, ...scriptTestToolDefs, ...placeToolDefs, ...freeformToolDefs]) {
    if (byName.has(def.name)) throw new Error(`Doppeltes Werkzeug-Schema: ${def.name}`);
    byName.set(def.name, def);
  }
  const result = TOOL_ORDER.map((name) => {
    const def = byName.get(name);
    if (!def) throw new Error(`Werkzeug ohne Schema: ${name}`);
    byName.delete(name);
    return def;
  });
  if (byName.size > 0) throw new Error(`Schema nicht in TOOL_ORDER: ${[...byName.keys()].join(", ")}`);
  return result;
}

export const AI_TOOLS: AiToolDefinition[] = assemble();

export function getToolDefinition(name: string): AiToolDefinition | undefined {
  return AI_TOOLS.find((tool) => tool.name === name);
}
