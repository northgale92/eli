#!/usr/bin/env python3
"""
Convierte Falconsai/nsfw_image_detection (ViT) a TFLite.

Instalación (una vez):
    pip install litert-torch transformers torch torchvision Pillow

Uso:
    python convert_nsfw.py

Salida:
    nsfw_falconsai.tflite               — float32 (~330 MB esperados)
    nsfw_falconsai_quantizado.tflite    — int8, solo si float32 > 20 MB

Compatibilidad con la app:
    Entrada: [1, 224, 224, 3] NHWC float32, rango [0.0, 1.0]
    (igual que el nsfw.tflite actual — no hay que tocar construirTensor())

    Salida: [1, 2] float32 logits [normal, nsfw]
    (la app usa [1, 5] — hay que actualizar moderacionAdultos.ts si se sustituye)

Licencia del modelo origen: Apache 2.0 (verificado 2026-06-28)
"""

import sys
import os
from pathlib import Path

import torch
from transformers import AutoModelForImageClassification

MODEL_ID     = "Falconsai/nsfw_image_detection"
PROJECT_ROOT = Path(__file__).parent.parent
OUT_DIR      = PROJECT_ROOT / "assets" / "modelos"
OUT_FLOAT = OUT_DIR / "nsfw_falconsai.tflite"
OUT_QUANT = OUT_DIR / "nsfw_falconsai_quantizado.tflite"
LIMIT_MB  = 20

# Guardia: nunca sobrescribir el modelo en producción
SAFE_GUARD = OUT_DIR / "nsfw.tflite"
assert not (OUT_FLOAT == SAFE_GUARD), "El archivo de salida no debe ser nsfw.tflite"

OUT_DIR.mkdir(parents=True, exist_ok=True)


class FalconsaiWrapper(torch.nn.Module):
    """
    Wrapper que adapta el ViT al formato de entrada de la app:
      - Acepta NHWC [1, 224, 224, 3] en rango [0, 1]  (igual que nsfw.tflite actual)
      - Aplica internamente la normalización ViT: (x - 0.5) / 0.5  → [-1, 1]
      - Devuelve logits [1, 2]:  índice 0 = normal, índice 1 = nsfw
    """
    def __init__(self, base: torch.nn.Module) -> None:
        super().__init__()
        self.base = base

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # [1, 224, 224, 3] NHWC → [1, 3, 224, 224] NCHW
        x = x.permute(0, 3, 1, 2)
        # Normalización ImageNet que usa el ViT internamente
        x = (x - 0.5) / 0.5
        return self.base(pixel_values=x).logits


def convert_float32(model: torch.nn.Module) -> None:
    import litert_torch

    sample = (torch.zeros(1, 224, 224, 3),)  # NHWC, igual que la app
    print("[2/4] Convirtiendo a TFLite float32 (puede tardar varios minutos)...")
    try:
        edge = litert_torch.convert(model, sample)
        edge.export(str(OUT_FLOAT))
    except Exception as exc:
        print(f"\nError en la conversión: {exc}")
        print(
            "\nPosible causa: litert_torch no soporta todas las operaciones de ViT "
            "en esta versión. Prueba:\n"
            "  pip install litert-torch --upgrade\n"
            "o abre un issue en https://github.com/google-ai-edge/litert-torch"
        )
        sys.exit(1)

    mb = OUT_FLOAT.stat().st_size / 1024 ** 2
    print(f"[3/4] Guardado: {OUT_FLOAT.relative_to(PROJECT_ROOT)}  ({mb:.1f} MB)")
    return mb


def convert_int8(model: torch.nn.Module) -> None:
    import litert_torch
    from litert_torch.quantize.pt2e_quantizer import PT2EQuantizer
    from litert_torch.quantize.quant_config import QuantConfig

    try:
        from torch.ao.quantization.quantizer.xnnpack_quantizer import (
            XNNPACKQuantizer,
            get_symmetric_quantization_config,
        )
        quantizer = XNNPACKQuantizer()
        quantizer.set_global(get_symmetric_quantization_config(is_per_channel=True))

        pt2e_q = PT2EQuantizer()
        pt2e_q.set_global(get_symmetric_quantization_config())

        quant_config = QuantConfig(pt2e_quantizer=pt2e_q)
    except ImportError:
        # Versiones más antiguas de litert_torch
        quant_config = QuantConfig()

    sample = (torch.zeros(1, 224, 224, 3),)
    print("[4/4] Aplicando cuantización int8...")
    try:
        edge_q = litert_torch.convert(model, sample, quant_config=quant_config)
        edge_q.export(str(OUT_QUANT))
        mb_q = OUT_QUANT.stat().st_size / 1024 ** 2
        print(f"       Guardado: {OUT_QUANT.relative_to(PROJECT_ROOT)}  ({mb_q:.1f} MB)")
    except Exception as exc:
        print(f"       Cuantización falló: {exc}")
        print(
            "       Alternativa manual: convierte el float32 con\n"
            "         python -c \"import tensorflow as tf; "
            "c=tf.lite.TFLiteConverter.from_saved_model(...); "
            "c.optimizations=[tf.lite.Optimize.DEFAULT]; open('q.tflite','wb').write(c.convert())\""
        )


def main() -> None:
    print(f"[1/4] Cargando {MODEL_ID} desde HuggingFace...")
    base = AutoModelForImageClassification.from_pretrained(MODEL_ID)
    base.eval()
    model = FalconsaiWrapper(base)
    model.eval()

    mb = convert_float32(model)

    if mb > LIMIT_MB:
        print(f"\n       {mb:.1f} MB > {LIMIT_MB} MB — generando versión cuantizada.")
        convert_int8(model)
    else:
        print(f"[4/4] {mb:.1f} MB ≤ {LIMIT_MB} MB — cuantización no necesaria.")

    print("\n--- Resumen ---")
    if OUT_FLOAT.exists():
        print(f"  float32 : {OUT_FLOAT}  ({OUT_FLOAT.stat().st_size/1024**2:.1f} MB)")
    if OUT_QUANT.exists():
        print(f"  int8    : {OUT_QUANT}  ({OUT_QUANT.stat().st_size/1024**2:.1f} MB)")

    print(
        "\nATENCIÓN — diferencia de salida respecto al modelo actual:\n"
        "  nsfw.tflite          → [1, 5]  (drawings, hentai, neutral, porn, sexy)\n"
        "  nsfw_falconsai.tflite → [1, 2]  (normal, nsfw)\n"
        "Si decides sustituirlo, actualiza el cálculo de score en\n"
        "  services/moderacionAdultos.ts  (líneas 59-62 y 156)\n"
        "de:  scores[1] + scores[3] + scores[4]\n"
        "a:   softmax(scores)[1]"
    )


if __name__ == "__main__":
    main()
