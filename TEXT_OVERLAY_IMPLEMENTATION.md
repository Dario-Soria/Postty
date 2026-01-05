# Text Overlay Post-Processing Implementation

## ✅ Implementation Complete

This document describes the text collection step added between reference selection and image generation for the Product Showcase agent.

---

## What Was Added

### New Step 5.5: Text Content Collection

**Location in Flow**: After user selects reference (Step 5), before "Click Generar" confirmation (Step 6)

**Purpose**: Ask user what text they want overlaid on their product showcase Instagram post

---

## Changes Made

### 1. Prompt Update ([Agents/Product Showcase/prompt.md](Agents/Product Showcase/prompt.md))

**Added Step 5.5** with instructions for:
- Asking user about text content in Spanish
- Providing clear options (headline, offer/subheadline, CTA)
- Allowing "sin texto" option for image-only generation
- Parsing user response into structured format
- Storing text specifications internally

**Updated Step 6 checklist** to include text content verification

---

### 2. Python Agent Updates ([Agents/Product Showcase/agent.py](Agents/Product Showcase/agent.py))

#### a) New State Variables (line ~201)
```python
self.text_content = None  # Store user's text specifications
self.awaiting_text_input = False  # Flag for text input state
```

#### b) New Helper Function: `_load_reference_json()` (line ~172)
- Loads JSON file associated with reference image
- Path: `reference-library/Jsons/{base_name}.json`
- Returns parsed JSON or None if not found

#### c) New Method: `_parse_text_content()` (line ~415)
- Parses user's natural language text specifications
- Extracts headline, subheadline, and CTA fields
- Smart detection of call-to-action keywords
- Returns structured dictionary

#### d) Modified `chat()` Method (line ~327)
**After reference selection:**
- Sets `awaiting_text_input = True`
- Asks user about text content
- Returns immediately with text question

**When awaiting text input:**
- Detects "no text" keywords → sets `text_content = None`
- Otherwise parses text → stores in `text_content`
- Shows confirmation with text preview
- Moves to ready state

#### e) Modified `_handle_generate_pipeline()` (line ~620)
- Checks if `text_content` is available
- Sets `skipText: 'false'` when text is provided
- Includes `textContent` as JSON string in form data
- Sets `skipText: 'true'` when user chose no text

---

### 3. Backend Pipeline Update ([src/routes/pipeline.ts](src/routes/pipeline.ts))

**Modified multipart form parser** (line ~176):
- Parses `textContent` field as JSON string
- Extracts headline, subheadline, CTA fields
- Passes to pipeline orchestrator
- Handles parsing errors gracefully

---

## User Flow

```
1. User uploads product photo ✅ (existing)
   ↓
2. Agent asks post type ✅ (existing)
   ↓
3. User selects post type ✅ (existing)
   ↓
4. Agent asks for description ✅ (existing)
   ↓
5. User provides description ✅ (existing)
   ↓
6. Agent searches references ✅ (existing)
   ↓
7. User selects reference (e.g., "2") ✅ (existing)
   ↓
8. 🆕 Agent asks: "¿Qué texto querés que tenga tu post?"
   ↓
9. 🆕 User responds:
     Option A: "VERANO 2025 y 50% OFF"
     Option B: "sin texto"
   ↓
10. Agent confirms ready ✅ (existing)
    ↓
11. User clicks "Generar" ✅ (existing)
    ↓
12. Pipeline generates:
     - Base image (Nano Banana)
     - Text overlay (if specified)
     - Final composed image
```

---

## Example Conversations

### Example 1: With Text

**Agent:** "Perfecto! Ahora, ¿qué texto querés que tenga tu post de Instagram?

Podés incluir:
- Título principal o frase destacada
- Oferta o beneficio (ej: '3x2', 'Envío gratis')
- Llamado a acción (ej: 'Comprá ahora', 'Link en bio')

O decime **'sin texto'** si preferís la imagen sola."

**User:** "Quiero NUEVA COLECCIÓN arriba y SHOP NOW abajo"

**Agent:** "Perfecto! Tengo todo listo para crear tu post:
- Título: 'NUEVA COLECCIÓN'
- Llamado a acción: 'SHOP NOW'
- Basado en la referencia que elegiste

**Cuando quieras generar el post, apretá el botón 'Generar' y listo.**"

---

### Example 2: Without Text

**Agent:** "Perfecto! Ahora, ¿qué texto querés que tenga tu post de Instagram?

Podés incluir:
- Título principal o frase destacada
- Oferta o beneficio (ej: '3x2', 'Envío gratis')
- Llamado a acción (ej: 'Comprá ahora', 'Link en bio')

O decime **'sin texto'** si preferís la imagen sola."

**User:** "sin texto"

**Agent:** "Perfecto! Tengo todo listo para crear tu post sin texto:
- Foto con producto elegante (referencia seleccionada)

**Cuando quieras generar el post, apretá el botón 'Generar' y listo.**"

---

## Technical Details

### Text Content Format

Stored in `agent.text_content`:
```python
{
    "headline": "NUEVA COLECCIÓN",      # Main text (optional)
    "subheadline": "50% OFF",           # Secondary text (optional)
    "cta": "SHOP NOW"                   # Call-to-action (optional)
}
```

Or `None` if user chose no text.

### Pipeline Request

**With text:**
```python
data = {
    'textPrompt': '...',
    'referenceImage': '455b905fb56f6bc30c66ab085a0e2f30.jpg',
    'skipText': 'false',
    'textContent': '{"headline": "NUEVA COLECCIÓN", "cta": "SHOP NOW"}',
    'language': 'es',
    'aspectRatio': '1:1'
}
```

**Without text:**
```python
data = {
    'textPrompt': '...',
    'referenceImage': '455b905fb56f6bc30c66ab085a0e2f30.jpg',
    'skipText': 'true',
    'language': 'es',
    'aspectRatio': '1:1'
}
```

---

## Testing Checklist

- [ ] Test with text: User provides headline + subheadline
- [ ] Test with text: User provides headline + CTA
- [ ] Test with text: User provides all three fields
- [ ] Test without text: User says "sin texto"
- [ ] Test without text: User says "imagen sola"
- [ ] Test edge case: User provides complex multi-line text
- [ ] Verify base image generates correctly with text overlay
- [ ] Verify base image generates correctly without text
- [ ] Check reference JSON loading works
- [ ] Verify Spanish text renders properly on images

---

## Files Modified

1. ✅ `Agents/Product Showcase/prompt.md` - Added Step 5.5 instructions
2. ✅ `Agents/Product Showcase/agent.py` - Text collection logic
3. ✅ `src/routes/pipeline.ts` - Parse textContent from form data

---

## No Changes To

❌ Frontend components - ZERO changes needed
❌ Database/indexing - ZERO changes needed
❌ Steps 0-5 of agent flow - ZERO changes
❌ Step 6-7 core logic - ZERO changes (only added text parameter)
❌ Other backend routes - ZERO changes
❌ Text compositor service - ZERO changes (already supported textContent)

---

## Next Steps

1. Test the complete flow with the agent
2. Try various text specifications
3. Verify text overlay renders correctly on generated images
4. Test "no text" option
5. Monitor logs for any parsing issues

---

## Troubleshooting

### If text doesn't appear on image:
- Check logs for `[DEBUG] Including text overlay: {...}`
- Verify `skipText: 'false'` is being sent
- Check textContent JSON parsing succeeded

### If agent doesn't ask about text:
- Check reference selection completed successfully
- Look for `awaiting_text_input = True` in logs
- Verify prompt.md Step 5.5 is loaded

### If parsing fails:
- User message is parsed using `_parse_text_content()`
- Check debug logs for parsed structure
- May need to adjust parsing heuristics for edge cases

