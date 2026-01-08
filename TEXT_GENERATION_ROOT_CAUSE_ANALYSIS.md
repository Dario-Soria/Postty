# Text Generation Quality - Root Cause Analysis

**Date**: January 8, 2026  
**Status**: ✅ Typography fix applied, ⚠️ Prompt quality issue identified

---

## Problem Summary

GUI generates images with poor text styling and product framing compared to test results, even with identical inputs.

**Perfect Test**: `test/results/agent_1767880721871.png` ✅  
**Poor GUI**: `generated-images/1767885671764_nanobanana_base.png` ❌

---

## ✅ Issue #1: Typography Format - FIXED

### Problem
The `buildFontDescription()` function was adding extra words:
- **BAD**: `serif with elegant character (thin strokes, flowing style)`
- **GOOD**: `serif elegant (thin strokes, flowing style)`

### Solution Applied
Modified `src/services/nanoBananaGenerator.ts` line 96-116:

```typescript
function buildFontDescription(style: any): string {
  const fontStyle = style.font_style || 'sans-serif';
  const fontCharacter = style.font_character || '';
  const fontNotes = style.font_specific_notes || '';
  
  let description = fontStyle;
  
  // Add character description inline
  if (fontCharacter) {
    description += ` ${fontCharacter}`;
  }
  
  // Add specific notes in parentheses
  if (fontNotes) {
    description += ` (${fontNotes})`;
  }
  
  return description;
}
```

### Result
Typography is now correctly formatted as `serif elegant (thin strokes, flowing style)` matching the test.

---

## ⚠️ Issue #2: User Intent (Prompt) Quality - ROOT CAUSE

### The Difference

**GUI Prompt:**
```
Photorealistic product advertisement. A woman wearing black studded leather boots (from the user's product image) is elegantly positioned on a luxurious, sun-drenched tennis court. She is calmly reading a newspaper. The scene is imbued with a warm, luxurious, and serene atmosphere, mimicking the selected reference image. The focus is on the woman and her boots, with the boots clearly visible from toe to top. Full-length shot, ensuring the boots are fully shown as the hero product. The composition provides clear space at the top for a text overlay. High-quality, fashion editorial photography.
```

**Test Prompt (Perfect):**
```
Professional fashion photography. A sophisticated woman wearing black leather knee-high boots with buckles (the hero product) from the user's uploaded image, sitting gracefully on a pristine green tennis court, reading a newspaper. The composition is calm and luxurious. Full-length view of the woman, with the boots clearly visible and extending to the ground. Soft, warm natural lighting creates an elegant, serene ambiance, in line with a luxurious and calm mood. Shallow depth of field. Clear space at the top 20% for text overlay, ensuring the full figure and boots are captured without cropping. The image has a clean, premium aesthetic.
```

### Key Missing Elements in GUI Prompt

1. **Photography-specific terms:**
   - ❌ GUI: Generic "warm, luxurious atmosphere"
   - ✅ Test: "Soft, warm natural lighting", "Shallow depth of field", "clean, premium aesthetic"

2. **Composition specificity:**
   - ❌ GUI: "clear space at the top"
   - ✅ Test: "Clear space at the top 20%"

3. **Subject action:**
   - ❌ GUI: "calmly reading"
   - ✅ Test: "sitting gracefully"

4. **Product description:**
   - ❌ GUI: "black studded leather boots"
   - ✅ Test: "black leather knee-high boots with buckles"

---

## Flow Analysis

### How USER REQUEST Gets Generated

```
User → Agent (Python + Gemini LLM) → PROMPT field → /pipeline → pipelineOrchestrator → userIntent → Gemini 2.5 Flash Image
```

**1. Agent receives**: User message + product image + selected reference

**2. Agent LLM generates**: `[TRIGGER_GENERATE_PIPELINE]` with `PROMPT:` field
   - File: `Agents/Product Showcase/agent.py` line 811-812
   - Extracts: `prompt = line_stripped[len("PROMPT:"):].strip()`

**3. Python sends to `/pipeline`**: `textPrompt = prompt`
   - File: `Agents/Product Showcase/agent.py` line 840

**4. Pipeline uses it**: `userIntent = input.textPrompt || ...`
   - File: `src/services/pipelineOrchestrator.ts` line 156

**5. Gemini receives**: Full prompt with `USER REQUEST: {userIntent}`
   - File: `src/services/nanoBananaGenerator.ts` via `buildGenerationPrompt()`

---

## Where the Agent Generates the PROMPT

The Agent (Gemini LLM) is instructed via `Agents/Product Showcase/prompt.md`:

```markdown
PROMPT: <detailed scene description combining user specs + reference DNA>
```

**Example given** (line 519):
```
PROMPT: High-fashion editorial photography. Full-length shot of elegant woman walking confidently on urban street during golden hour. She wears cream coat over brown outfit with black studded leather boots (the hero product). Wide framing captures complete figure from head to boots on ground, with clear space at top 20% for text overlay. Natural autumn sunlight creates warm ambiance. Sophisticated composition ensures boots remain fully visible and prominent. Professional fashion photography style.
```

### The Problem

The Agent LLM is **not consistently** generating prompts with this level of detail and photography-specific terminology. It generates more generic descriptions.

---

## Solution Options

### Option 1: Enhance Agent System Instructions ⭐ RECOMMENDED

Improve `Agents/Product Showcase/prompt.md` with explicit prompt writing guidelines:

**Add section:**
```markdown
## PROMPT WRITING GUIDELINES

When generating the PROMPT field for image generation, you MUST include:

1. **Photography Style Specifics:**
   - Lighting: "Soft, warm natural lighting" / "Golden hour sunlight" / "Studio lighting with key + fill"
   - Depth: "Shallow depth of field" / "Deep focus" / "Bokeh background"
   - Quality markers: "Professional", "Editorial", "Commercial grade"

2. **Composition Precision:**
   - Exact percentages: "Clear space at top 20%" not "clear space at top"
   - Framing: "Full-length shot", "Wide framing", "Complete figure from head to feet"
   - Positioning: "Center frame", "Rule of thirds", "Left-aligned with negative space right"

3. **Subject Description Detail:**
   - Action verbs: "sitting gracefully", "walking confidently", "posing elegantly"
   - Adjectives: "sophisticated woman", "pristine tennis court", "luxurious ambiance"
   - Product specifics: Describe key features from product analysis

4. **Mood & Atmosphere:**
   - Use concrete terms: "serene", "elegant", "energetic", "intimate"
   - Reference lighting mood: "warm", "cool", "dramatic", "soft"
   - Mention aesthetic: "clean premium aesthetic", "vintage feel", "modern minimalist"

**Good Example:**
"Professional fashion photography. Sophisticated woman sitting gracefully on pristine green tennis court, reading newspaper. Full-length view with boots clearly visible from top to ground. Soft, warm natural lighting creates elegant, serene ambiance. Shallow depth of field. Clear space at top 20% for text overlay. Clean, premium aesthetic."

**Bad Example:**
"Woman on tennis court reading newspaper with boots. Nice lighting and clear space for text."
```

### Option 2: Prompt Template in Python Code

Add a prompt template function in `agent.py` that structures the prompt:

```python
def _build_detailed_prompt(self, user_description: str, reference_dna: dict, product_features: str) -> str:
    """Build a detailed photography prompt with specific terminology"""
    
    # Extract photography elements from reference
    lighting = reference_dna.get('lighting', {})
    composition = reference_dna.get('composition', {})
    
    # Build prompt with photography-specific terms
    prompt_parts = [
        "Professional fashion photography.",
        user_description,  # User's scene description
        f"Full-length shot ensuring {product_features} visible.",
        "Soft, warm natural lighting creates elegant ambiance.",
        "Shallow depth of field.",
        "Clear space at top 20% for text overlay.",
        "Clean, premium aesthetic."
    ]
    
    return " ".join(prompt_parts)
```

### Option 3: SQLite Reference Enhancement

Add `photography_guidelines` to reference images in SQLite with technical specs:
- `lighting_style`: "soft natural", "golden hour", "studio"
- `depth_of_field`: "shallow", "deep", "bokeh"
- `composition_notes`: "rule of thirds", "center frame", etc.

Extract and inject these into the prompt.

---

## Recommended Implementation Plan

**Step 1**: Enhance Agent System Instructions (Option 1)
- Add detailed "PROMPT WRITING GUIDELINES" section to `prompt.md`
- Provide concrete examples of good vs bad prompts
- List photography terminology to use

**Step 2**: Test with GUI
- Generate images through GUI with enhanced Agent
- Compare prompts sent to Gemini
- Verify photography-specific terms are included

**Step 3**: If needed, add Prompt Builder Function (Option 2)
- Create Python helper to enforce prompt structure
- Ensure consistency across generations

---

## Files to Modify

### Primary Fix (Option 1)
- `Agents/Product Showcase/prompt.md` - Add PROMPT WRITING GUIDELINES section

### Alternative/Additional Fixes
- `Agents/Product Showcase/agent.py` - Add `_build_detailed_prompt()` helper function
- `reference-library/index.sqlite` - Add `photography_guidelines` column (if needed)

---

## Expected Outcome

After implementing Option 1:
- Agent will generate prompts with photography-specific terminology
- GUI-generated images will have better composition matching test quality
- Text will be properly styled (already fixed)
- Product will be better framed and focused

**Before**: Generic "warm atmosphere" prompts  
**After**: Detailed "Soft, warm natural lighting. Shallow depth of field. Clean, premium aesthetic." prompts

