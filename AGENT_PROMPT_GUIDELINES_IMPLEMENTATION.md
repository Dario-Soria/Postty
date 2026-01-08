# Agent Prompt Writing Guidelines - Implementation Complete

**Date**: January 8, 2026  
**Status**: ✅ IMPLEMENTED

---

## What Was Implemented

Enhanced the Product Showcase Agent's system instructions (`Agents/Product Showcase/prompt.md`) with comprehensive **PROMPT WRITING GUIDELINES** to ensure the Agent generates professional, detailed prompts with photography-specific terminology.

---

## Changes Made

### File Modified

**`Agents/Product Showcase/prompt.md`** - Added 200+ lines of detailed prompt writing guidelines

### New Section Added (Lines ~513-673)

#### 🎯 PROMPT WRITING GUIDELINES - CRITICAL

A comprehensive guide teaching the Agent to write professional photography prompts with:

**1. Required Elements Checklist**
- Photography style declaration
- Lighting specifications
- Camera technique terms
- Precise composition specs
- Action verbs & descriptive language
- Quality & aesthetic markers

**2. Prompt Formula**
```
[Photography Style]. [Subject Action] + [Scene Details] + [Product Description]. 
[Framing Specs]. [Lighting Description]. [Camera Technique]. 
[Text Space Specification]. [Quality Markers].
```

**3. Excellent Examples (3 provided)**
- Fashion/Footwear example
- Product Lifestyle example
- Product Focused example

Each example demonstrates all required elements.

**4. Bad Examples (3 provided)**
Shows what NOT to do with explanations of why each is insufficient.

**5. Pre-Generation Checklist**
9-point checklist the Agent must verify before generating.

---

## Key Guidelines Added

### Photography Style Declarations
✅ "Professional fashion photography"  
✅ "High-fashion editorial photography"  
✅ "Commercial product photography"  
❌ "Product advertisement" (too generic)

### Lighting Specifications
✅ "Soft, warm natural lighting"  
✅ "Golden hour sunlight"  
✅ "Studio lighting with soft shadows"  
❌ "nice lighting" (too vague)

### Camera Techniques
✅ "Shallow depth of field"  
✅ "Deep focus"  
✅ "Bokeh background"  
❌ No technique mentioned

### Precise Composition
✅ "Clear space at top 20% for text overlay"  
❌ "clear space for text" (no percentage)

### Sophisticated Language
✅ "sitting gracefully" / "walking confidently"  
✅ "sophisticated woman" / "pristine tennis court"  
❌ "positioned" / "nice woman" (too generic)

### Quality Markers
✅ "Clean, premium aesthetic"  
✅ "Editorial quality composition"  
✅ "Commercial advertising standard"  
❌ "high quality" (too generic)

---

## Example Prompt Comparison

### Before (Generic - What Agent Was Generating)
```
Photorealistic product advertisement. A woman wearing black studded leather boots is elegantly positioned on a luxurious, sun-drenched tennis court. She is calmly reading a newspaper. The scene is imbued with a warm, luxurious, and serene atmosphere, mimicking the selected reference image. The focus is on the woman and her boots, with the boots clearly visible from toe to top. Full-length shot, ensuring the boots are fully shown as the hero product. The composition provides clear space at the top for a text overlay. High-quality, fashion editorial photography.
```

**Problems:**
- ❌ No specific lighting description
- ❌ No camera technique
- ❌ No composition percentage
- ❌ Generic language ("positioned", "imbued with")
- ❌ No quality markers at end

### After (Professional - What Agent Should Generate)
```
Professional fashion photography. Sophisticated woman sitting gracefully on pristine green tennis court, reading newspaper. She wears black leather knee-high boots with buckles (the hero product). Full-length view with boots clearly visible from top to ground. Soft, warm natural lighting creates elegant, serene ambiance. Shallow depth of field. Clear space at top 20% for text overlay. Clean, premium aesthetic.
```

**Improvements:**
- ✅ "Professional fashion photography" (style declaration)
- ✅ "Soft, warm natural lighting" (specific lighting)
- ✅ "Shallow depth of field" (camera technique)
- ✅ "top 20%" (precise percentage)
- ✅ "sitting gracefully" (action verb)
- ✅ "sophisticated", "pristine", "elegant" (descriptive language)
- ✅ "Clean, premium aesthetic" (quality marker)

---

## Updated Example in prompt.md

Updated the example trigger (line ~685) to demonstrate all guidelines:

```
[TRIGGER_GENERATE_PIPELINE]
PRODUCT_IMAGE: /Users/dariosoria/Code/Postty v4.0/temp-uploads/agent-upload-1234567890-boots.jpg
REFERENCE_IMAGE: 1221244e4701b242ec2cfc5015f98b4a.jpg
PROMPT: High-fashion editorial photography. Elegant woman walking confidently on urban cobblestone street during golden hour. She wears cream trench coat over brown outfit with black studded leather boots (the hero product). Wide framing captures complete figure from head to boots on ground. Natural autumn sunlight creates warm, luxurious atmosphere. Shallow depth of field. Clear space at top 20% for text overlay. Sophisticated composition ensures boots remain fully visible and prominent. Commercial advertising quality with clean, premium aesthetic.
```

**Checklist verified:**
- ✓ Professional style: "High-fashion editorial photography"
- ✓ Specific lighting: "Natural autumn sunlight creates warm, luxurious atmosphere"
- ✓ Camera technique: "Shallow depth of field"
- ✓ Exact percentage: "top 20%"
- ✓ Action verbs: "walking confidently"
- ✓ Descriptive adjectives: "elegant", "cobblestone", "luxurious"
- ✓ Full-length spec: "Wide framing captures complete figure from head to boots on ground"
- ✓ Hero product: Explicitly called out as "(the hero product)"
- ✓ Quality markers: "Commercial advertising quality with clean, premium aesthetic"

---

## Final Reminders Updated

Added to FINAL REMINDERS section (line ~672):

> **🎯 PROMPT QUALITY IS CRITICAL** - Follow the PROMPT WRITING GUIDELINES exactly. Use professional photography terminology, specific lighting descriptions, camera techniques, exact percentages, sophisticated language, and quality markers. Generic prompts = generic results.

---

## How It Works

### Agent Flow

1. **User interacts with Agent** through GUI
2. **Agent reads prompt.md** as system instructions (loaded on each request)
3. **Agent generates PROMPT field** following the new guidelines
4. **Python code extracts PROMPT** and sends to `/pipeline` as `textPrompt`
5. **Backend uses it** as `userIntent` in Gemini prompt
6. **Gemini generates image** with better composition based on professional prompt

### No Restart Required

The Agent service (`productShowcaseAgent.ts`) starts the Python agent **on-demand per request**. Each request loads `prompt.md` fresh, so the new guidelines are **immediately active** on the next generation.

---

## Expected Results

### Before This Implementation
- Generic prompts: "positioned on tennis court with nice lighting"
- Poor text styling (already fixed in typography update)
- Generic compositions

### After This Implementation
- Professional prompts: "sitting gracefully on pristine green tennis court. Soft, warm natural lighting. Shallow depth of field. Top 20% text space."
- Correct text styling (typography fix already working)
- Professional compositions matching test quality

---

## Testing Instructions

### To Verify the Fix

1. **Open GUI** and start a new conversation with the Agent
2. **Upload product image** (e.g., boots)
3. **Follow Agent flow** through reference selection
4. **Provide user description** of desired scene
5. **Click "Generar"**
6. **Check server logs** at `/tmp/postty-server.log` for the generated prompt
7. **Look for**:
   - ✓ "Professional fashion photography" or similar style declaration
   - ✓ Specific lighting terms (e.g., "Soft, warm natural lighting")
   - ✓ Camera technique (e.g., "Shallow depth of field")
   - ✓ Exact percentages (e.g., "top 20%")
   - ✓ Professional language (e.g., "sitting gracefully")
   - ✓ Quality markers (e.g., "Clean, premium aesthetic")

### Sample Log Output to Look For

```
📝 FULL PROMPT being sent to Gemini:
════════════════════════════════════════════════════════════════════════════════
TASK: Create a promotional image with TEXT OVERLAY.
...
USER REQUEST: Professional fashion photography. Sophisticated woman sitting gracefully on pristine green tennis court, reading newspaper. She wears black leather knee-high boots with buckles (the hero product). Full-length view with boots clearly visible from top to ground. Soft, warm natural lighting creates elegant, serene ambiance. Shallow depth of field. Clear space at top 20% for text overlay. Clean, premium aesthetic.
...
════════════════════════════════════════════════════════════════════════════════
```

---

## Files Modified

1. **`Agents/Product Showcase/prompt.md`**
   - Added ~200 lines of PROMPT WRITING GUIDELINES (lines ~513-673)
   - Updated example trigger to demonstrate guidelines (line ~685)
   - Updated FINAL REMINDERS with prompt quality emphasis (line ~672)

---

## Related Documents

- **[TEXT_GENERATION_FIX_SUMMARY.md](TEXT_GENERATION_FIX_SUMMARY.md)** - Typography fix details
- **[TEXT_GENERATION_ROOT_CAUSE_ANALYSIS.md](TEXT_GENERATION_ROOT_CAUSE_ANALYSIS.md)** - Complete root cause analysis
- **[PROMPT_COMPARISON_GUI_VS_TEST.md](PROMPT_COMPARISON_GUI_VS_TEST.md)** - Side-by-side comparison

---

## Success Criteria

✅ **Typography format**: Already fixed - `serif elegant (thin strokes, flowing style)`  
✅ **Agent guidelines**: Now implemented with comprehensive prompt writing instructions  
🔄 **Awaiting test**: Generate through GUI to verify prompts now match test quality

**Next Step**: Test generation through GUI with the same inputs as the perfect test to confirm the Agent now generates professional-quality prompts.

---

## Summary

The Agent will now generate prompts with:
- Professional photography terminology
- Specific technical specifications
- Sophisticated descriptive language
- Precise composition details

This should bring GUI-generated results up to the quality level of your perfect test result.

