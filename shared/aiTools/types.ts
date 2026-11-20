export type AiToolName =
  | 'get_world'
  | 'add_entity'
  | 'update_entity'
  | 'remove_entity'
  | 'set_environment'
  | 'set_script'
  | 'set_media'
  | 'move_avatar'
  | 'say'
  | 'group_entities'
  | 'ungroup'
  | 'library_list'
  | 'library_place'
  | 'library_save'
  | 'set_graph'
  | 'plan_create'
  | 'plan_get'
  | 'plan_update_node'
  | 'plan_add_node'
  | 'plan_remove_node'
  | 'plan_complete_node'
  | 'look'
  | 'add_wall'
  | 'add_beam'
  | 'array'
  | 'clone_group'
  | 'get_bounds'
  | 'surface_height_at'
  | 'search_images'
  | 'add_bricks'
  | 'fill_bricks'
  | 'bricks_profile'
  | 'use_texture'
  | 'script_log'
  | 'check_overlaps'
  | 'script_test'
  | 'use_image'
  | 'place_relative'
  | 'align_entities'
  | 'fit_to_opening'
  | 'verify'
  | 'find_free_spot'
  | 'what_changed'
  | 'plan_connect'
  | 'plan_edit';

export interface AiToolDefinition {
  name: AiToolName;
  description: string;
  /** JSON-Schema des Eingabeobjekts (wie von der Anthropic Messages API erwartet). */
  input_schema: Record<string, unknown>;
  /** Ändert die Welt (benötigt Baurecht). */
  mutates: boolean;
}
