#!/usr/bin/env python3
"""
Compara tres clasificadores NSFW sobre el mismo set de imágenes de prueba.

Instalación (una vez):
    pip install tflite-runtime Pillow numpy requests tabulate

    # Si tflite-runtime no está disponible para tu plataforma, usa tensorflow:
    pip install tensorflow Pillow numpy requests tabulate

Uso:
    python compare_models.py

    El script crea automáticamente test_images/ con:
      - test_images/safe/   — 10 imágenes benignas de picsum.photos (CC0)
      - test_images/nsfw/   — debes añadir tú imágenes NSFW legales (ver instrucciones)

    Para añadir imágenes NSFW manualmente:
      Copia imágenes etiquetadas como NSFW en test_images/nsfw/
      (solo contenido adulto legal; nunca CSAM)

    Opcionalmente, descarga del dataset de HuggingFace:
      pip install datasets
      python compare_models.py --hf-dataset hannuln/nsfw --hf-split test --hf-nsfw-label 1

Modelos que compara:
    nsfw.tflite                     — GantMan MobileNet V2, salida [1,5]
    nsfw_falconsai.tflite           — Falconsai ViT float32, salida [1,2]
    nsfw_falconsai_quantizado.tflite — Falconsai ViT int8, salida [1,2]  (si existe)
"""

import argparse
import sys
import math
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image

# ── Rutas ────────────────────────────────────────────────────────────────────

MODELS_DIR  = Path(__file__).parent.parent / "assets" / "modelos"
SCRIPTS_DIR = Path(__file__).parent
TEST_DIR    = SCRIPTS_DIR / "test_images"
SAFE_DIR    = TEST_DIR / "safe"
NSFW_DIR    = TEST_DIR / "nsfw"

MODEL_CURRENT = MODELS_DIR / "nsfw.tflite"
MODEL_FLOAT   = MODELS_DIR / "nsfw_falconsai.tflite"
MODEL_QUANT   = MODELS_DIR / "nsfw_falconsai_quantizado.tflite"

INPUT_SIZE = 224


# ── TFLite runtime ────────────────────────────────────────────────────────────

def get_interpreter():
    try:
        import tflite_runtime.interpreter as tflite
        return tflite.Interpreter
    except ImportError:
        pass
    try:
        import tensorflow as tf
        return tf.lite.Interpreter
    except ImportError:
        print(
            "Error: instala tflite-runtime o tensorflow:\n"
            "  pip install tflite-runtime\n"
            "  — o —\n"
            "  pip install tensorflow"
        )
        sys.exit(1)


# ── Preprocesado ──────────────────────────────────────────────────────────────

def preprocess(image_path: Path) -> np.ndarray:
    """
    Devuelve [1, 224, 224, 3] float32 en rango [0, 1] NHWC.
    Compatible con nsfw.tflite actual Y con nsfw_falconsai.tflite
    (que incluye la normalización ViT internamente gracias al wrapper).
    """
    img = Image.open(image_path).convert("RGB").resize((INPUT_SIZE, INPUT_SIZE))
    arr = np.array(img, dtype=np.float32) / 255.0          # [224, 224, 3], [0,1]
    return arr[np.newaxis, ...]                              # [1, 224, 224, 3]


# ── Inferencia ────────────────────────────────────────────────────────────────

def run_model(interpreter_cls, model_path: Path, tensor: np.ndarray) -> dict:
    """
    Ejecuta el modelo y devuelve {'score': float, 'label': str, 'raw': list}.
    score siempre en [0,1] donde 1.0 = máximo NSFW.
    """
    interp = interpreter_cls(model_path=str(model_path))
    interp.allocate_tensors()

    inp = interp.get_input_details()[0]
    out = interp.get_output_details()[0]

    # Cuantización int8: escalar a int8 si el modelo lo requiere
    if inp["dtype"] == np.int8:
        scale, zero_point = inp["quantization"]
        data = (tensor / scale + zero_point).astype(np.int8)
    elif inp["dtype"] == np.uint8:
        data = (tensor * 255).astype(np.uint8)
    else:
        data = tensor

    interp.set_tensor(inp["index"], data)
    interp.invoke()
    raw = interp.get_tensor(out["index"])

    # Desescalar si la salida está cuantizada
    if out["dtype"] == np.int8:
        scale, zero_point = out["quantization"]
        raw = (raw.astype(np.float32) - zero_point) * scale

    raw = raw.flatten().tolist()
    n_classes = len(raw)

    if n_classes == 5:
        # GantMan: [drawings, hentai, neutral, porn, sexy]
        score = raw[1] + raw[3] + raw[4]   # igual que moderacionAdultos.ts:156
        score = min(score, 1.0)
    elif n_classes == 2:
        # Falconsai: [normal, nsfw] — aplicar softmax sobre logits
        exp = [math.exp(v) for v in raw]
        total = sum(exp)
        probs = [e / total for e in exp]
        score = probs[1]                    # P(nsfw)
        raw = probs
    else:
        score = max(raw)

    label = "NSFW" if score >= 0.5 else "safe"
    return {"score": score, "label": label, "raw": raw}


# ── Imágenes de prueba ────────────────────────────────────────────────────────

SAFE_PICSUM = [
    # picsum.photos: CC0, sin autenticación
    ("paisaje_montana", "https://picsum.photos/id/29/224/224"),
    ("bosque",          "https://picsum.photos/id/15/224/224"),
    ("playa",           "https://picsum.photos/id/39/224/224"),
    ("ciudad",          "https://picsum.photos/id/62/224/224"),
    ("perro",           "https://picsum.photos/id/237/224/224"),
    ("flor",            "https://picsum.photos/id/82/224/224"),
    ("libro",           "https://picsum.photos/id/24/224/224"),
    ("cafe",            "https://picsum.photos/id/225/224/224"),
    ("arquitectura",    "https://picsum.photos/id/114/224/224"),
    ("naturaleza",      "https://picsum.photos/id/119/224/224"),
]


def download_safe_images() -> None:
    SAFE_DIR.mkdir(parents=True, exist_ok=True)
    existing = list(SAFE_DIR.glob("*.jpg")) + list(SAFE_DIR.glob("*.png"))
    if len(existing) >= len(SAFE_PICSUM):
        print(f"  [safe] {len(existing)} imágenes ya presentes, omitiendo descarga.")
        return

    print(f"  [safe] Descargando {len(SAFE_PICSUM)} imágenes de picsum.photos (CC0)...")
    for name, url in SAFE_PICSUM:
        dst = SAFE_DIR / f"{name}.jpg"
        if dst.exists():
            continue
        try:
            urllib.request.urlretrieve(url, dst)
            print(f"    ✓ {name}.jpg")
        except Exception as exc:
            print(f"    ✗ {name}: {exc}")


def try_download_hf_nsfw(dataset_name: str, split: str, nsfw_label: int) -> bool:
    """
    Descarga hasta 10 imágenes NSFW del dataset de HuggingFace indicado.
    Devuelve True si tuvo éxito.
    """
    try:
        from datasets import load_dataset
    except ImportError:
        print("    datasets no instalado: pip install datasets")
        return False

    NSFW_DIR.mkdir(parents=True, exist_ok=True)
    print(f"  [nsfw] Cargando {dataset_name} (split={split}) desde HuggingFace...")
    try:
        ds = load_dataset(dataset_name, split=split, streaming=True)
    except Exception as exc:
        print(f"    Error cargando dataset: {exc}")
        return False

    count = 0
    for i, item in enumerate(ds):
        if count >= 10:
            break
        # Intenta detectar la columna de etiqueta
        label_col = None
        for col in ("label", "nsfw", "class", "category"):
            if col in item:
                label_col = col
                break
        if label_col is None:
            print("    No se encontró columna de etiqueta en el dataset.")
            return False

        if item[label_col] != nsfw_label:
            continue

        img_col = None
        for col in ("image", "img", "pixel_values"):
            if col in item:
                img_col = col
                break
        if img_col is None:
            continue

        img = item[img_col]
        if not isinstance(img, Image.Image):
            continue

        dst = NSFW_DIR / f"hf_{count:02d}.jpg"
        img.convert("RGB").save(dst)
        print(f"    ✓ hf_{count:02d}.jpg")
        count += 1

    return count > 0


def ensure_test_images(args) -> None:
    print("\n[1/3] Preparando imágenes de prueba...")
    download_safe_images()

    NSFW_DIR.mkdir(parents=True, exist_ok=True)
    nsfw_existing = list(NSFW_DIR.glob("*.jpg")) + list(NSFW_DIR.glob("*.png")) + list(NSFW_DIR.glob("*.jpeg"))

    if nsfw_existing:
        print(f"  [nsfw] {len(nsfw_existing)} imágenes ya presentes.")
    elif args.hf_dataset:
        ok = try_download_hf_nsfw(args.hf_dataset, args.hf_split, args.hf_nsfw_label)
        if not ok:
            _print_nsfw_instructions()
    else:
        _print_nsfw_instructions()


def _print_nsfw_instructions() -> None:
    print(
        "\n  [nsfw] La carpeta test_images/nsfw/ está vacía.\n"
        "  Añade imágenes NSFW legales manualmente (solo contenido adulto, nunca CSAM),\n"
        "  o descarga de un dataset público:\n\n"
        "    pip install datasets\n"
        "    python compare_models.py --hf-dataset <nombre-dataset-hf> --hf-split test --hf-nsfw-label 1\n\n"
        "  El script continuará solo con las imágenes safe disponibles."
    )


# ── Tabla de comparación ──────────────────────────────────────────────────────

def fmt_score(score: float, label: str) -> str:
    return f"{label} ({score:.2f})"


def compare(interpreter_cls, models: dict) -> None:
    print("\n[2/3] Ejecutando inferencia...")

    rows = []
    headers = [
        "Imagen", "Esperado",
        "nsfw.tflite (actual)",
        "nsfw_falconsai",
        "nsfw_falconsai_quant",
        "¿Coinciden?"
    ]

    for expected, folder in [("safe", SAFE_DIR), ("nsfw", NSFW_DIR)]:
        images = sorted(
            list(folder.glob("*.jpg")) +
            list(folder.glob("*.jpeg")) +
            list(folder.glob("*.png"))
        )
        if not images:
            continue

        for img_path in images:
            tensor = preprocess(img_path)
            results = {}
            for key, path in models.items():
                try:
                    results[key] = run_model(interpreter_cls, path, tensor)
                except Exception as exc:
                    results[key] = {"score": -1, "label": f"ERROR: {exc}", "raw": []}

            labels = [r["label"] for r in results.values()]
            unique = set(labels)
            agreement = "✓ sí" if len(unique) == 1 else f"✗ ({', '.join(unique)})"

            row = [img_path.name, expected]
            row.append(fmt_score(results["current"]["score"], results["current"]["label"]) if "current" in results else "—")
            row.append(fmt_score(results["float"]["score"], results["float"]["label"]) if "float" in results else "—")
            row.append(fmt_score(results["quant"]["score"], results["quant"]["label"]) if "quant" in results else "N/A")
            row.append(agreement)
            rows.append(row)

    print("\n[3/3] Resultados:\n")
    try:
        from tabulate import tabulate
        print(tabulate(rows, headers=headers, tablefmt="github"))
    except ImportError:
        # Fallback sin tabulate
        sep = " | "
        print(sep.join(f"{h:<28}" for h in headers))
        print("-" * (30 * len(headers)))
        for row in rows:
            print(sep.join(f"{str(v):<28}" for v in row))

    # Estadísticas de precisión
    print("\n--- Precisión por modelo ---")
    for key, col_idx in [("current", 2), ("float", 3), ("quant", 4)]:
        correct = sum(
            1 for r in rows
            if rows[0][1] != "—"  # tiene etiqueta esperada
            and r[col_idx] != "—" and r[col_idx] != "N/A"
            and (
                (r[1] == "safe" and "safe" in str(r[col_idx])) or
                (r[1] == "nsfw" and "NSFW" in str(r[col_idx]))
            )
        )
        total = sum(1 for r in rows if r[col_idx] not in ("—", "N/A"))
        if total > 0:
            model_names = {"current": "nsfw.tflite (actual)", "float": "nsfw_falconsai", "quant": "nsfw_falconsai_quant"}
            print(f"  {model_names[key]:<30}: {correct}/{total} correctas ({100*correct/total:.0f}%)")


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Compara clasificadores NSFW")
    parser.add_argument("--hf-dataset",    default=None,  help="Dataset de HuggingFace para imágenes NSFW")
    parser.add_argument("--hf-split",      default="test", help="Split del dataset (default: test)")
    parser.add_argument("--hf-nsfw-label", default=1, type=int, help="Valor de etiqueta NSFW en el dataset (default: 1)")
    args = parser.parse_args()

    interpreter_cls = get_interpreter()

    # Verificar qué modelos existen
    models = {}
    if MODEL_CURRENT.exists():
        models["current"] = MODEL_CURRENT
    else:
        print(f"AVISO: no se encontró {MODEL_CURRENT}")

    if MODEL_FLOAT.exists():
        models["float"] = MODEL_FLOAT
    else:
        print(f"AVISO: {MODEL_FLOAT} no existe — ejecuta convert_nsfw.py primero")

    if MODEL_QUANT.exists():
        models["quant"] = MODEL_QUANT
    else:
        print(f"AVISO: {MODEL_QUANT} no existe — se omitirá de la comparación")

    if not models:
        print("Error: no hay ningún modelo disponible.")
        sys.exit(1)

    ensure_test_images(args)
    compare(interpreter_cls, models)


if __name__ == "__main__":
    main()
