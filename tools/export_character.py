"""
Exporta un personaje de Blender al dashboard (GLB + ficha JSON).

Uso (Blender en modo consola, no hace falta abrir la interfaz):
  blender.exe -b "ruta/personaje.blend" --python tools/export_character.py -- ^
      --id robot-mascota --name "Robot Mascota" --collection Robot

- Exporta solo los objetos de la colección indicada (sin cámara, luces ni piso).
- Cada marcador de la línea de tiempo se convierte en una animación del dashboard
  (va desde su frame hasta el frame anterior al siguiente marcador).
- Registra el personaje en characters/index.json para que aparezca en el selector.
- No modifica ni guarda el .blend original.
- Si la ficha ya existía, conserva los campos agregados a mano (como "interactions").
"""
import argparse
import json
import os
import sys

import bpy
from mathutils import Vector

# Carpeta raíz del dashboard (este script vive en <dashboard>/tools)
DASHBOARD_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHARACTERS_DIR = os.path.join(DASHBOARD_ROOT, "characters")
INDEX_PATH = os.path.join(CHARACTERS_DIR, "index.json")

# Animaciones que por defecto se repiten en bucle (el resto se reproduce una vez)
LOOPING_KEYWORDS = ("reposo", "idle", "correr", "run", "caminar", "walk", "pensando")


def parse_args():
    """Lee los argumentos que vienen después de '--' en la línea de comandos."""
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--id", required=True, help="Identificador sin espacios, ej. robot-mascota")
    parser.add_argument("--name", required=True, help="Nombre visible en el dashboard")
    parser.add_argument("--collection", required=True, help="Colección que contiene al personaje")
    parser.add_argument("--default-clip", default=None, help="Animación inicial (nombre del marcador)")
    return parser.parse_args(argv)


def collect_objects(collection_name):
    """Devuelve todos los objetos de la colección (incluidas subcolecciones)."""
    collection = bpy.data.collections.get(collection_name)
    if collection is None:
        raise SystemExit(f"No existe la colección '{collection_name}'")
    return list(collection.all_objects)


def compute_rest_height(objects):
    """Calcula la caja envolvente de las mallas en el frame inicial (para encuadrar en la web)."""
    scene = bpy.context.scene
    scene.frame_set(scene.frame_start)
    mins = Vector((1e9, 1e9, 1e9))
    maxs = Vector((-1e9, -1e9, -1e9))
    for obj in objects:
        if obj.type != "MESH":
            continue
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            mins = Vector(map(min, mins, world))
            maxs = Vector(map(max, maxs, world))
    # Blender usa Z arriba; en three.js la altura es Y
    return {"height": round(maxs.z - mins.z, 4), "minZ": round(mins.z, 4)}


def build_clips(scene):
    """Convierte los marcadores de la línea de tiempo en rangos de animación."""
    markers = sorted(scene.timeline_markers, key=lambda m: m.frame)
    clips = []
    for i, marker in enumerate(markers):
        start = marker.frame
        end = markers[i + 1].frame - 1 if i + 1 < len(markers) else scene.frame_end
        if end <= start:
            continue
        clips.append({
            "id": marker.name,
            "label": marker.name.replace("_", " "),
            "start": start,
            "end": end,
            "loop": any(k in marker.name.lower() for k in LOOPING_KEYWORDS),
        })
    return clips


def export_glb(objects, output_path):
    """Selecciona solo el personaje y lo exporta a GLB con la animación de toda la escena."""
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.hide_set(False)
        obj.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=output_path,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_animations=True,
        # SCENE: hornea la línea de tiempo completa en un solo clip,
        # así los objetos de mano (galleta, agua…) quedan sincronizados con el esqueleto
        export_animation_mode="SCENE",
        export_force_sampling=True,
        export_optimize_animation_size=True,
        export_frame_range=False,
    )


def update_index(entry):
    """Agrega o reemplaza el personaje en characters/index.json."""
    index = {"characters": []}
    if os.path.exists(INDEX_PATH):
        with open(INDEX_PATH, encoding="utf-8") as f:
            index = json.load(f)
    index["characters"] = [c for c in index["characters"] if c["id"] != entry["id"]]
    index["characters"].append(entry)
    with open(INDEX_PATH, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)


def main():
    args = parse_args()
    scene = bpy.context.scene
    objects = collect_objects(args.collection)

    character_dir = os.path.join(CHARACTERS_DIR, args.id)
    os.makedirs(character_dir, exist_ok=True)

    bounds = compute_rest_height(objects)
    clips = build_clips(scene)
    default_clip = args.default_clip or next((c["id"] for c in clips if c["loop"]), clips[0]["id"] if clips else None)

    export_glb(objects, os.path.join(character_dir, "model.glb"))

    # Ficha del personaje que lee el dashboard
    manifest = {
        "id": args.id,
        "name": args.name,
        "model": f"characters/{args.id}/model.glb",
        "fps": scene.render.fps / scene.render.fps_base,
        "frameStart": scene.frame_start,
        "height": bounds["height"],
        "defaultClip": default_clip,
        "clips": clips,
        "source": os.path.basename(bpy.data.filepath),
    }
    manifest_path = os.path.join(character_dir, "character.json")
    # Conserva los datos agregados a mano (por ejemplo "interactions": alimentar y animaciones al tocar)
    if os.path.exists(manifest_path):
        with open(manifest_path, encoding="utf-8") as f:
            previous = json.load(f)
        manifest = {**previous, **manifest}
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    update_index({"id": args.id, "name": args.name, "manifest": f"characters/{args.id}/character.json"})
    print(f"EXPORT_OK {args.id}: {len(clips)} animaciones, altura {bounds['height']}")


main()
