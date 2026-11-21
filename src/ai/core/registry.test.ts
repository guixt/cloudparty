import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { AI_TOOLS } from '../../../shared/aiTools';
import { getHandler, registeredToolNames } from './registry';
import './tools'; // lädt und registriert alle Handler-Gruppen

/** Reihenfolge und Mutationsflag der Werkzeuge vor dem Umbau (die Reihenfolge hängt am Prompt-Caching der API). */
const EXPECTED_ORDER: Array<[string, boolean]> = [
  ['get_world', false],
  ['add_entity', true],
  ['update_entity', true],
  ['remove_entity', true],
  ['set_environment', true],
  ['set_script', true],
  ['set_media', true],
  ['move_avatar', false],
  ['say', false],
  ['group_entities', true],
  ['ungroup', true],
  ['library_list', false],
  ['library_place', true],
  ['library_save', false],
  ['set_graph', true],
  ['plan_create', true],
  ['plan_get', false],
  ['plan_update_node', true],
  ['plan_add_node', true],
  ['plan_connect', true],
  ['plan_edit', true],
  ['plan_remove_node', true],
  ['plan_complete_node', true],
  ['look', false],
  ['add_wall', true],
  ['add_beam', true],
  ['array', true],
  ['clone_group', true],
  ['get_bounds', false],
  ['surface_height_at', false],
  ['search_images', false],
  ['add_bricks', true],
  ['fill_bricks', true],
  ['bricks_profile', true],
  ['check_overlaps', false],
  ['script_log', false],
  ['script_test', true],
  ['use_texture', true],
  ['use_image', true],
  ['place_relative', true],
  ['align_entities', true],
  ['fit_to_opening', true],
  ['verify', false],
  ['find_free_spot', false],
  ['what_changed', false],
  ['add_curved_wall', true],
  ['add_lathe', true],
  ['add_surface', true],
  ['add_wavy_wall', true],
  ['update_freeform', true],
];
const EXPECTED_JSON_LENGTH = 58014;
const EXPECTED_JSON_SHA256 = 'b49efc2b4981bdc2dbc311000619d23a79b73c56dbd2fa795382399cbf466ff8';

describe('Werkzeug-Registry', () => {
  const schemaNames = AI_TOOLS.map((t) => t.name);

  it('jedes Schema hat einen Handler', () => {
    for (const name of schemaNames) expect(getHandler(name), name).toBeTypeOf('function');
  });

  it('jeder Handler hat ein Schema', () => {
    for (const name of registeredToolNames()) expect(schemaNames, name).toContain(name);
  });

  it('hat keine Duplikate', () => {
    expect(new Set(schemaNames).size).toBe(schemaNames.length);
    const handlerNames = registeredToolNames();
    expect(new Set(handlerNames).size).toBe(handlerNames.length);
  });

  it('Schemas sind Objekt-Schemas mit Beschreibung', () => {
    for (const tool of AI_TOOLS) {
      expect(tool.input_schema.type, tool.name).toBe('object');
      expect(tool.description.length, tool.name).toBeGreaterThan(0);
    }
  });

  it('wirft bei doppelter Registrierung', async () => {
    const { registerHandlers } = await import('./registry');
    expect(() => registerHandlers({ get_world: () => ({ ok: true, content: '', summary: '', mutated: false }) })).toThrow(/doppelt/);
  });

  it('Reihenfolge und Mutationsflags sind unverändert', () => {
    expect(AI_TOOLS.map((t) => [t.name, t.mutates])).toEqual(EXPECTED_ORDER);
  });

  it('das gesamte Schema-JSON ist bytegleich', () => {
    const json = JSON.stringify(AI_TOOLS);
    expect(json.length).toBe(EXPECTED_JSON_LENGTH);
    expect(createHash('sha256').update(json).digest('hex')).toBe(EXPECTED_JSON_SHA256);
  });
});
