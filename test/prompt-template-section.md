# GEMINI PROMPT TEMPLATE

This template defines how the Product Showcase Agent builds complete prompts for Gemini image generation.

**Philosophy:** This template is the single source of truth. To improve results, edit this file - not code.

---

## COMPLETE PROMPT STRUCTURE

When generating the final image, construct the prompt using this structure:

### Section 1: Task & Scene Description

```
TASK: Create a promotional image with TEXT OVERLAY.

INPUTS:
1. REFERENCE IMAGE: Use for style inspiration - match the color palette, lighting mood, and especially the TYPOGRAPHY STYLE
   
2. PRODUCT IMAGE: Study this product carefully and RECREATE it in the scene. DO NOT paste or overlay this image. Generate a photorealistic version of this product integrated naturally into the scene.

CRITICAL: The product image is PROVIDED AS REFERENCE ONLY. You must GENERATE the product in the scene, not paste the original image. The product should look like it belongs in the scene naturally.

USER REQUEST: [USER_DESCRIPTION]

SCENE COMPOSITION:
- Frame: [FRAMING_TYPE] (e.g., full-length shot, close-up, wide angle)
- Subject wearing: [OUTFIT_DESCRIPTION] - BE EXPLICIT about colors (e.g., "white elegant dress", not just "dress")
- Product (hero): [PRODUCT_DESCRIPTION]
- Setting: [LOCATION_DESCRIPTION]
- Mood: [MOOD_DESCRIPTION]
- Lighting: [LIGHTING_DESCRIPTION]
- Depth of field: [DEPTH_DESCRIPTION]
- Padding: 10-15% at top/bottom to prevent cropping
- Text space: Top 20% clear for text overlay

SCENE: [SCENE_TYPE]
```

### Section 2: Text Overlay Requirements

```
TEXT OVERLAY REQUIREMENTS:
🚨 CRITICAL: You MUST include text overlays in the generated image. Text is not optional.

Generate the following text directly rendered into the image:

[TEXT_ELEMENTS]

PRODUCT DOMINANT COLORS: [PRODUCT_COLORS]
IMPORTANT: Ensure text has excellent contrast against the background. If the product or background uses similar colors to the text, adjust the text color or add subtle shadows/outlines for readability.
```

### Section 3: Typography Matching Instructions

```
TYPOGRAPHY MATCHING INSTRUCTIONS:
🎯 CRITICAL: Study the REFERENCE IMAGE typography in extreme detail and REPLICATE it precisely:

1. FONT CHARACTERISTICS:
   - Analyze the exact letter forms, stroke weights, and character shapes in the reference
   - Match the font style (serif/sans-serif/script/display) AND the character mood (elegant/bold/luxury/etc.)
   - If reference shows script fonts, determine if they're elegant calligraphic vs casual brush style
   - If reference shows serif, note if they're traditional, modern, or decorative

2. POSITIONING & SPACING:
   - Match the vertical positioning EXACTLY - measure where text sits in the reference
   - Maintain the same spacing between headline and subheadline as shown in reference
   - Preserve the relationship between text and other elements (person, product, background)

3. VISUAL INTEGRATION:
   - Text should look like it belongs in the scene, not just overlaid
   - Match how the reference integrates text with imagery
   - If reference shows text with effects (shadows, outlines), replicate those
   - Text must be crisp, clear, and highly readable

4. HIERARCHY & SCALE:
   - Maintain the same size relationships between text elements as the reference
   - Headline should dominate with the same visual weight as reference
   - Subheadline should have similar relative sizing

🚨 The specifications above describe the reference typography - use them to MATCH the reference style precisely.
```

### Section 4: Text Spelling Accuracy

```
🚨 TEXT SPELLING ACCURACY - CRITICAL:
⚠️ PERFECT SPELLING IS MANDATORY: Each word MUST be rendered with 100% accurate spelling, letter by letter.
- Before generating, mentally spell out each word character-by-character
- Double-check EVERY letter in EVERY word before finalizing
- Pay special attention to Spanish characters: ñ, á, é, í, ó, ú, ü
- Common mistakes to avoid:
  * Mixing 'j' and 'h' sounds (e.g., "agujeros" has 'j', not 'h')
  * Missing or wrong letters in middle of words (e.g., "hermana" not "harmana")
  * Confusing similar-looking letters (e.g., 'o' vs '0', 'l' vs 'I')
- VERIFICATION STEP: After rendering text, verify spelling matches EXACTLY what was specified above

🚨 TEXT GENERATION IS MANDATORY: The output image MUST contain the specified text overlays. Do not generate an image without text.
```

### Section 5: Output Requirements

```
OUTPUT REQUIREMENTS:
- [ASPECT_RATIO] aspect ratio
- Photorealistic, high quality
- Product must be clearly visible and featured (but GENERATED, not pasted from product image)
- Professional advertising quality with text integrated naturally
- Text should be crisp, clear, and readable
- VERIFY: All specified text elements are present and visible in the output
```

---

## VARIABLE PLACEHOLDERS

The following placeholders are replaced with actual values:

- `[USER_DESCRIPTION]` - The complete scene description from the agent
- `[FRAMING_TYPE]` - Camera framing (full-length, close-up, etc.)
- `[OUTFIT_DESCRIPTION]` - Explicit outfit details with colors
- `[PRODUCT_DESCRIPTION]` - The hero product details
- `[LOCATION_DESCRIPTION]` - Setting description
- `[MOOD_DESCRIPTION]` - Overall mood and ambiance
- `[LIGHTING_DESCRIPTION]` - Lighting style
- `[DEPTH_DESCRIPTION]` - Depth of field specification
- `[SCENE_TYPE]` - Scene type description
- `[TEXT_ELEMENTS]` - Formatted text overlay specifications
- `[PRODUCT_COLORS]` - Dominant product colors in hex
- `[ASPECT_RATIO]` - Image aspect ratio (1:1, 9:16, 4:5)

---

## EXAMPLE: How to Improve Results

**Problem:** Gemini generates black dress instead of white dress

**Solution:** Edit this file

```markdown
BEFORE:
- Subject wearing: [OUTFIT_DESCRIPTION]

AFTER:
- Subject wearing: [OUTFIT_DESCRIPTION]
- 🚨 CRITICAL: Always specify exact outfit colors (e.g., "white elegant dress and black boots")
- Pay close attention to color words - they are MANDATORY and NOT optional
```

Save → Test → See results → Iterate again if needed

**No code changes. No server restart. Just edit this markdown file.**

---

## ITERATION WORKFLOW

1. Run test: `npx ts-node test/test-generate.ts --mode=agent`
2. Review output in `test/results/`
3. Not satisfied? Edit this file
4. Run test again
5. Repeat until perfect

This is the power of prompt-driven development!

