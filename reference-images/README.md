# Reference Images

Esta carpeta contiene las imágenes de referencia para el pipeline de generación.

## Uso

1. Coloca aquí las fotos tomadas en el local o imágenes de referencia
2. El pipeline seleccionará aleatoriamente una imagen de esta carpeta
3. También puedes especificar una imagen específica en la request

## Formatos soportados

- PNG (.png)
- JPEG (.jpg, .jpeg)
- WebP (.webp)

## Recomendaciones

- **Resolución mínima**: 1024x1024 pixels
- **Aspect ratio**: Preferiblemente 1:1 o 9:16 para Instagram
- **Calidad**: Alta calidad, bien iluminadas
- **Contenido**: Escenas de tu local, ambientes, fondos que representen tu marca

## Ejemplo de uso en la API

```bash
# Usar imagen de referencia aleatoria
curl -X POST http://localhost:8080/pipeline \
  -F "productImage=@producto.jpg" \
  -F "textPrompt=Promoción especial de verano"

# Usar imagen de referencia específica
curl -X POST http://localhost:8080/pipeline \
  -F "productImage=@producto.jpg" \
  -F "textPrompt=Promoción especial de verano" \
  -F "referenceImage=mi-local.jpg"
```

