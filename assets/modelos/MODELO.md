# Modelo TFLite de moderación

## Archivo actual: `nsfw.tflite`

Colocado en `assets/modelos/nsfw.tflite` — descargado desde el release v1.1.0
del repositorio GantMan/nsfw_model.

## Especificación del modelo

| Parámetro | Valor |
|-----------|-------|
| Input | `[1, 224, 224, 3]` float32, valores en `[0.0, 1.0]` |
| Output | `[1, 5]` float32 — `[drawings, hentai, neutral, porn, sexy]` |
| Arquitectura | MobileNet V2 (140 × 224) |
| Tamaño | ~24.4 MB (float32, no cuantizado) |
| Precisión | ~93% (según GantMan) |

## Interpretación de las 5 clases

La lógica en `services/moderacion.ts` suma `hentai + porn + sexy` como
score NSFW. Los umbrales son:

```ts
const UMBRAL_BLOQUEO = 0.7;   // > 0.7 → bloqueado
const UMBRAL_NEBLINA = 0.5;   // 0.5–0.7 → neblina universal
```

## Fuente

https://github.com/GantMan/nsfw_model/releases/tag/1.1.0
Archivo: `nsfw_mobilenet_v2_140_224.zip` → `mobilenet_v2_140_224/saved_model.tflite`

## Mejora futura

Este modelo se reemplazará por uno entrenado específicamente para los
casos de uso de ELI (con clases binarias segura/nsfw y cuantizado INT8
para menor tamaño y mayor velocidad en dispositivo).
