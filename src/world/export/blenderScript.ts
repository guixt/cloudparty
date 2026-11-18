/**
 * Blender-Skript (Option C): richtet nach dem Import der .glb Collections, Sonne, Himmel, Kamera und eine einfache Insel ein.
 * Das Skript wird als Text erzeugt (reine Funktion, testbar); ausgeführt wird es in Blenders Skript-Fenster (Alt+P).
 * Koordinaten: Der Babylon-Exporter spiegelt X (links- → rechtshändig, glTF = (−x, y, z)); der Blender-Import macht daraus (x, −z, y). Insgesamt Blender = (−x, −z, y).
 */
import type { WorldSpec } from '../../../shared/types';
import { SKY_PRESETS, customSkyLook, kelvinToRgb, parseLightDirection, sunVector, type Rgb } from '../../engine/environment/presets';

export interface BlenderScriptInput {
  /** Dateiname der .glb (liegt neben dem Skript bzw. der .blend-Datei). */
  glbFile: string;
  world: WorldSpec;
}

const py = (n: number) => (Math.round(n * 1000) / 1000).toString();
const tuple = (v: readonly number[]) => `(${v.map(py).join(', ')})`;
const pyString = (s: string) => JSON.stringify(s);

export function skyColors(world: WorldSpec): { top: Rgb; horizon: Rgb } {
  const sky = world.environment.sky;
  const look = sky.preset === 'custom' ? customSkyLook(sky.color) : SKY_PRESETS[sky.preset];
  return { top: look.top, horizon: look.horizon };
}

export function buildBlenderScript({ glbFile, world }: BlenderScriptInput): string {
  const env = world.environment;
  const dir = parseLightDirection(env.light.direction);
  const sun = sunVector(dir);
  const sunBlender: [number, number, number] = [-sun[0], -sun[2], sun[1]];
  const sunColor = kelvinToRgb(env.light.temperatureK);
  const sky = skyColors(world);
  const island = world.island ?? { radius: 40, depth: 18 };
  const radius = island.radius;
  const depth = island.depth;
  const energy = Math.max(0.5, env.light.intensity * 2.2);

  return `# Cloudparty -> Blender (erzeugt von Cloudparty)
# Anleitung: In Blender "Scripting" öffnen, diese Datei laden und mit Alt+P ausführen.
# Die .glb-Datei muss im selben Ordner liegen wie diese Datei (oder die .blend-Datei);
# sonst GLB_PATH unten auf den vollständigen Pfad setzen.
import bpy, os, math
from mathutils import Vector

GLB_NAME = ${pyString(glbFile)}
GLB_PATH = ""  # leer = neben dieser Datei / der .blend suchen
SUN_DIRECTION = ${tuple(sunBlender)}   # Richtung zur Sonne (Blender-Koordinaten)
SUN_COLOR = ${tuple(sunColor)}
SUN_ENERGY = ${py(energy)}
SKY_TOP = ${tuple(sky.top)}
SKY_HORIZON = ${tuple(sky.horizon)}
ISLAND_RADIUS = ${py(radius)}
ISLAND_DEPTH = ${py(depth)}

def find_glb():
    if GLB_PATH:
        return GLB_PATH
    folders = []
    try:
        folders.append(os.path.dirname(os.path.abspath(__file__)))
    except NameError:
        pass
    if bpy.data.filepath:
        folders.append(os.path.dirname(bpy.data.filepath))
    folders.append(os.getcwd())
    for folder in folders:
        candidate = os.path.join(folder, GLB_NAME)
        if os.path.exists(candidate):
            return candidate
    return os.path.join(folders[0], GLB_NAME)

def import_glb(path):
    # Mehrere Aufrufarten, weil sich die Operator-Parameter zwischen Blender-Versionen unterscheiden.
    folder, name = os.path.split(path)
    attempts = [
        {"filepath": path},
        {"filepath": path, "directory": folder + os.sep, "files": [{"name": name}]},
    ]
    last = None
    for kwargs in attempts:
        try:
            bpy.ops.import_scene.gltf(**kwargs)
            return True
        except Exception as error:  # noqa: BLE001
            last = error
            print("Import-Versuch fehlgeschlagen:", sorted(kwargs.keys()), "->", error)
    print("Der automatische Import ist fehlgeschlagen:", last)
    return False

def main():
    path = os.path.normpath(find_glb())
    print("Cloudparty: suche", path, "vorhanden:", os.path.exists(path), "Größe:", os.path.getsize(path) if os.path.exists(path) else "-")
    already = [o for o in bpy.data.objects if o.get("cp_id") is not None]
    if not already:
        if not os.path.exists(path):
            raise FileNotFoundError("Datei nicht gefunden: " + path + " (GLB_PATH im Skript setzen)")
        if not import_glb(path):
            raise RuntimeError(
                "Import nicht möglich. Importiere die Datei von Hand (Datei > Importieren > glTF 2.0, "
                + path + ") und führe dieses Skript danach erneut aus: es erkennt die importierten Objekte."
            )
    else:
        print("Cloudparty: vorhandene importierte Objekte gefunden, Import wird übersprungen.")
    imported = [o for o in bpy.data.objects if o.get("cp_id") is not None]

    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1.0

    # Collections nach Gruppen (Eigenschaft cp_group_name aus dem Export)
    groups = {}
    for obj in imported:
        group = obj.get("cp_group_name") or obj.get("cp_group")
        if not group:
            continue
        coll = groups.get(group)
        if coll is None:
            coll = bpy.data.collections.new(str(group))
            scene.collection.children.link(coll)
            groups[group] = coll
        for old in list(obj.users_collection):
            old.objects.unlink(obj)
        coll.objects.link(obj)

    # Glatte Normalen für Rundungen, Materialien sauber benennen
    for obj in imported:
        if obj.type == 'MESH':
            for poly in obj.data.polygons:
                poly.use_smooth = False

    # Einfache Insel (grüne Oberseite) als Boden
    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=ISLAND_RADIUS, depth=ISLAND_DEPTH, location=(0, 0, -ISLAND_DEPTH / 2))
    island = bpy.context.active_object
    island.name = "Insel"
    green = bpy.data.materials.new("Insel Gras")
    green.diffuse_color = (0.18, 0.5, 0.15, 1)
    if green.use_nodes:
        bsdf = green.node_tree.nodes.get("Principled BSDF")
        if bsdf:
            bsdf.inputs["Base Color"].default_value = (0.18, 0.5, 0.15, 1)
            bsdf.inputs["Roughness"].default_value = 0.9
    island.data.materials.append(green)

    # Sonne
    sun_data = bpy.data.lights.new("Sonne", 'SUN')
    sun_data.energy = SUN_ENERGY
    sun_data.color = SUN_COLOR
    sun_obj = bpy.data.objects.new("Sonne", sun_data)
    scene.collection.objects.link(sun_obj)
    toward_sun = Vector(SUN_DIRECTION).normalized()
    sun_obj.rotation_euler = Vector((0, 0, -1)).rotation_difference(-toward_sun).to_euler()

    # Himmel
    world = scene.world or bpy.data.worlds.new("Himmel")
    scene.world = world
    world.use_nodes = True
    nodes = world.node_tree.nodes
    links = world.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputWorld")
    bg = nodes.new("ShaderNodeBackground")
    try:
        sky_tex = nodes.new("ShaderNodeTexSky")
        sky_tex.sky_type = 'NISHITA'
        sky_tex.sun_elevation = math.asin(max(-1.0, min(1.0, toward_sun.z)))
        sky_tex.sun_rotation = math.atan2(toward_sun.x, toward_sun.y)
        links.new(sky_tex.outputs["Color"], bg.inputs["Color"])
    except Exception:
        bg.inputs["Color"].default_value = (SKY_HORIZON[0], SKY_HORIZON[1], SKY_HORIZON[2], 1)
    links.new(bg.outputs["Background"], out.inputs["Surface"])

    # Kamera (schaut aus Südwesten auf die Mitte der Insel)
    cam_data = bpy.data.cameras.new("Kamera")
    cam_data.lens = 35
    cam = bpy.data.objects.new("Kamera", cam_data)
    scene.collection.objects.link(cam)
    cam.location = (-ISLAND_RADIUS * 0.45, -ISLAND_RADIUS * 0.7, ISLAND_RADIUS * 0.35)
    target = bpy.data.objects.new("Kamera-Ziel", None)
    target.location = (0, 0, 1)
    scene.collection.objects.link(target)
    track = cam.constraints.new('TRACK_TO')
    track.target = target
    track.track_axis = 'TRACK_NEGATIVE_Z'
    track.up_axis = 'UP_Y'
    scene.camera = cam

    # Renderer (EEVEE; Name hängt von der Blender-Version ab)
    for engine in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE'):
        try:
            scene.render.engine = engine
            break
        except TypeError:
            continue

    print("Cloudparty-Import fertig:", len(imported), "Objekte,", len(groups), "Gruppen")

main()
`;
}
