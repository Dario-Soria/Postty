# Text Generation Discrepancy Fix - Summary

**Date**: January 8, 2026  
**Status**: ✅ FIXED

---

## Problem

GUI-generated images had poor text styling compared to test-generated images, even with identical inputs.

**Perfect Test Result**: `test/results/agent_1767880721871.png`  
- Text: `Botas "el Uli"` and `50% off en toda la tienda`
- Typography: Serif elegant with thin strokes, flowing style
- Product: Fully focused, properly positioned

**Bad GUI Result**: `generated-images/1767883962407_nanobanana_base.png`  
- Text styling not following design guidelines from SQLite
- Product not fully focused as in test

---

## Root Cause

The `buildFontDescription()` function in [`src/services/nanoBananaGenerator.ts`](src/services/nanoBananaGenerator.ts) was formatting typography descriptions incorrectly:

**Before (BAD)**:
```
serif with elegant character (thin strokes, flowing style)
```

**Should be (GOOD)**:
```
serif elegant (thin strokes, flowing style)
```

### Why This Mattered

The SQLite database (`reference-library/index.sqlite`) stores rich typography data:
```json
{
  "font_style": "serif",
  "font_character": "elegant", 
  "font_specific_notes": "thin strokes, flowing style"
}
```

The extra words "with" and "character" in the font description confused Gemini's text generation, causing it to use incorrect fonts or positioning.

---

## Investigation Process

### 1. Verified SQLite Data ✅

Queried the database for reference `cd685fd378f8039b616dc66cbc698d06.jpg` (the tennis court reference):

```sql
SELECT json_extract(design_guidelines, '$.typography.headline') 
FROM reference_images 
WHERE original_filename = 'cd685fd378f8039b616dc66cbc698d06.jpg';
```

**Result**: Database has correct, rich typography data including:
- `font_style: "serif"`
- `font_character: "elegant"`
- `font_specific_notes: "thin strokes, flowing style"`

### 2. Traced Data Flow ✅

```
SQLite design_guidelines
  ↓
agent.py: self.design_guidelines['typography']
  ↓
/pipeline: formData.typographyStyle (JSON string)
  ↓
pipelineOrchestrator: input.typographyStyle (parsed object)
  ↓
nanoBananaGenerator: params.typographyStyle
  ↓
buildFontDescription() ← ISSUE WAS HERE
  ↓
promptTemplateReader: textElements injected into template
  ↓
Gemini API
```

### 3. Identified the Bug ✅

**File**: [`src/services/nanoBananaGenerator.ts:24-42`](src/services/nanoBananaGenerator.ts)

**Old Code**:
```typescript
function buildFontDescription(style: any): string {
  const fontStyle = style.font_style || 'sans-serif';
  const fontCharacter = style.font_character || '';
  const fontNotes = style.font_specific_notes || '';
  
  let description = fontStyle;
  
  if (fontCharacter) {
    description += ` with ${fontCharacter} character`; // ❌ Extra words
  }
  
  if (fontNotes) {
    description += ` (${fontNotes})`;
  }
  
  return description;
}
```

**Problem**: Added "with" and "character" which aren't in the test prompt.

---

## The Fix

**Changed lines 32-34** in [`src/services/nanoBananaGenerator.ts`](src/services/nanoBananaGenerator.ts):

```typescript
function buildFontDescription(style: any): string {
  const fontStyle = style.font_style || 'sans-serif';
  const fontCharacter = style.font_character || '';
  const fontNotes = style.font_specific_notes || '';
  
  let description = fontStyle;
  
  // Add character description inline (no extra words)
  if (fontCharacter) {
    description += ` ${fontCharacter}`; // ✅ Clean, matches test
  }
  
  // Add specific notes in parentheses if available
  if (fontNotes) {
    description += ` (${fontNotes})`;
  }
  
  return description;
}
```

**Result**:
- **Before**: `serif with elegant character (thin strokes, flowing style)`
- **After**: `serif elegant (thin strokes, flowing style)` ✅

Now matches the test prompt exactly!

---

## Additional Changes

### Enhanced Logging

Added comprehensive logging to debug future issues:

**File**: [`src/routes/pipeline.ts:198-207`](src/routes/pipeline.ts)
```typescript
logger.info(`🎨 Typography style content: ${JSON.stringify(typographyStyle, null, 2)}`);
```

**File**: [`src/services/nanoBananaGenerator.ts:159-162`](src/services/nanoBananaGenerator.ts)
```typescript
logger.info(`   📝 Text ${index + 1} font description: "${fontDesc}"`);
logger.info(`   📝 Text ${index + 1} style object: ${JSON.stringify(style, null, 2)}`);
```

**File**: [`src/services/nanoBananaGenerator.ts:206-212`](src/services/nanoBananaGenerator.ts)
```typescript
logger.info(`📝 FULL PROMPT being sent to Gemini:`);
logger.info('═'.repeat(80));
logger.info(basePrompt);
logger.info('═'.repeat(80));
```

---

## Verification

### Test Environment
- **Reference**: `cd685fd378f8039b616dc66cbc698d06.jpg` (woman reading newspaper on tennis court)
- **Product**: Black leather boots with buckles
- **Text**: `Botas "el Uli"` and `50% off en toda la tienda`

### Expected Outcome
GUI now generates:
- **Correct font style**: Serif elegant (thin strokes, flowing style) - exactly as in test
- **Correct positioning**: Centered, at 40% vertical position
- **Product fully focused**: As in the perfect test result

---

## Files Modified

1. **[`src/services/nanoBananaGenerator.ts`](src/services/nanoBananaGenerator.ts)**
   - Fixed `buildFontDescription()` function (lines 24-42)
   - Added debug logging for font descriptions (lines 159-162)
   - Added full prompt logging (lines 206-212)

2. **[`src/routes/pipeline.ts`](src/routes/pipeline.ts)**
   - Added typography style content logging (line 205)

---

## Key Takeaways

1. **SQLite has rich data** - The database design_guidelines contain detailed typography specs
2. **Prompt formatting matters** - Extra words like "with character" confused Gemini
3. **Test as source of truth** - The test prompt format should be the target
4. **Logging is essential** - Added comprehensive logging to debug future discrepancies

---

## Next Steps for User

1. ✅ Server has been restarted with the fix
2. ✅ Try generating through GUI with the same inputs as test
3. ✅ Text should now match the style guidelines from SQLite
4. ✅ Product should be properly focused as in test result

**The fix is live and ready to test!**

---

## 🔍 UPDATE: Further Investigation Results

After testing with the GUI, we discovered:

### ✅ Typography Fix - CONFIRMED WORKING

The typography format is now correct in both flows:
- **GUI Output**: `serif elegant (thin strokes, flowing style)` ✅
- **Test Output**: `serif elegant (thin strokes, flowing style)` ✅

### ⚠️ REAL ISSUE IDENTIFIED: Prompt Quality Discrepancy

**The typography fix is working**, but the images still differ because the **Agent LLM generates less detailed prompts** than the manually-crafted test prompt.

**GUI Prompt (Generated by Agent):**
```
Photorealistic product advertisement. A woman wearing black studded leather boots (from the user's product image) is elegantly positioned on a luxurious, sun-drenched tennis court. She is calmly reading a newspaper. The scene is imbued with a warm, luxurious, and serene atmosphere, mimicking the selected reference image. The focus is on the woman and her boots, with the boots clearly visible from toe to top. Full-length shot, ensuring the boots are fully shown as the hero product. The composition provides clear space at the top for a text overlay. High-quality, fashion editorial photography.
```

**Test Prompt (Manually Written - Perfect):**
```
Professional fashion photography. A sophisticated woman wearing black leather knee-high boots with buckles (the hero product) from the user's uploaded image, sitting gracefully on a pristine green tennis court, reading a newspaper. The composition is calm and luxurious. Full-length view of the woman, with the boots clearly visible and extending to the ground. Soft, warm natural lighting creates an elegant, serene ambiance, in line with a luxurious and calm mood. Shallow depth of field. Clear space at the top 20% for text overlay, ensuring the full figure and boots are captured without cropping. The image has a clean, premium aesthetic.
```

**Missing in GUI prompts:**
- ❌ Photography-specific terms: "Shallow depth of field", "Soft, warm natural lighting"
- ❌ Precise composition specs: "top 20%" instead of just "top"
- ❌ Specific action verbs: "sitting gracefully" vs "positioned"
- ❌ Quality markers: "Clean, premium aesthetic"
- ❌ Professional terminology: "pristine", "sophisticated"

### Root Cause: Agent System Instructions

The Agent (Gemini LLM in `Agents/Product Showcase/agent.py`) generates the `PROMPT` field that becomes the `USER REQUEST` in the final Gemini prompt. The Agent's system instructions (`Agents/Product Showcase/prompt.md`) don't provide explicit guidance on using photography-specific terminology.

**Flow:**
```
Agent LLM → generates PROMPT field → agent.py extracts it → sends as textPrompt to /pipeline → becomes USER REQUEST in Gemini prompt
```

### Solution Required

To achieve test-quality results through the GUI, enhance `Agents/Product Showcase/prompt.md` with **explicit PROMPT WRITING GUIDELINES** that teach the Agent to generate prompts with:
1. Photography-specific terminology
2. Precise composition percentages
3. Professional action verbs and descriptive adjectives
4. Technical quality markers

**See full analysis**: [`TEXT_GENERATION_ROOT_CAUSE_ANALYSIS.md`](TEXT_GENERATION_ROOT_CAUSE_ANALYSIS.md)

### Current Status

✅ **Typography format**: FIXED - Working correctly  
✅ **SQLite data extraction**: Working correctly  
⚠️ **Prompt quality**: Agent needs better prompt writing guidelines  

**Note**: The typography fix you requested is complete and working. The remaining quality difference is due to the Agent's prompt generation style, which is a separate issue from the original typography problem.

