# Prompt Comparison Report

Generated: 2026-01-08T13:38:31.316Z

## Current Prompt (Hardcoded)

**Length:** 5051 characters
**Location:** src/services/nanoBananaGenerator.ts

```
# Nano Banana Generation Prompt

This is the exact prompt sent to Gemini 2.5 Flash Image for generation ID: `1767876654154_nanobanana_base.png`

---

TASK: Create a promotional image with TEXT OVERLAY.

INPUTS:
1. REFERENCE IMAGE: Use for style inspiration - match the color palette, lighting mood, and especially the TYPOGRAPHY STYLE
   
2. PRODUCT IMAGE: Study this product carefully and RECREATE it in the scene. DO NOT paste or overlay this image. Generate a photorealistic version of this product integrated naturally into the scene.

CRITICAL: The product image is PROVIDED AS REFERENCE ONLY. You must GENERATE the product in the scene, not paste the original image. The product should look like it belongs in the scene naturally.

USER REQUEST: Professional fashion photography. A sophisticated woman wearing black leather knee-high boots with buckles (the hero product) from the user's uploaded image, sitting gracefully on a pristine green tennis court, reading a newspaper. The composition is calm and luxurious. Full-length view of the woman, with the boots clearly visible and extending to the ground. Soft, warm natural lighting creates an elegant, serene ambiance, in line with a luxurious and calm mood. Shallow depth of field. Clear space at the top 20% for text overlay, ensuring the full figure and boots are captured without cropping. The image has a clean, premium aesthetic.

SCENE: Clean product photography with minimal background.

TEXT OVERLAY REQUIREMENTS:
🚨 CRITICAL: You MUST include text overlays in the generated image. Text is not optional.

Generate the following text directly rendered into the image:

Text 1: "Botas "el Uli"
- Typography: serif elegant (thin strokes, flowing style)
- Weight: regular
- Case: title-case
- Color: black
- Vertical Position: 40% from top edge
- Size: large (relative to canvas)
- Alignment: center
- Letter Spacing: normal

Text 2: "50% off en toda la tienda"
- Typography: script elegant
- Weight: regular
- Color: black
- Vertical Position: 45% from top edge
- Spacing: tight (5-10% gap) gap from headline above
- Size: medium (relative to canvas)
- Alignment: center
- Letter Spacing: normal

PRODUCT DOMINANT COLORS: #F6F4EF, #2E2F31, #B2B1AE
IMPORTANT: Ensure text has excellent contrast against the background. If the product or background uses similar colors to the text, adjust the text color or add subtle shadows/outlines for readability.

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

OUTPUT REQUIREMENTS:
- 1:1 aspect ratio
- Photorealistic, high quality
- Product must be clearly visible and featured (but GENERATED, not pasted from product image)
- Professional advertising quality with text integrated naturally
- Text should be crisp, clear, and readable
- VERIFY: All specified text elements are present and visible in the output


```

## Agent Prompt (Dynamic)

**Length:** 5048 characters
**Location:** test/prompt-template-section.md

```
TASK: Create a promotional image with TEXT OVERLAY.

INPUTS:
1. REFERENCE IMAGE: Use for style inspiration - match the color palette, lighting mood, and especially the TYPOGRAPHY STYLE
   
2. PRODUCT IMAGE: Study this product carefully and RECREATE it in the scene. DO NOT paste or overlay this image. Generate a photorealistic version of this product integrated naturally into the scene.

CRITICAL: The product image is PROVIDED AS REFERENCE ONLY. You must GENERATE the product in the scene, not paste the original image. The product should look like it belongs in the scene naturally.

USER REQUEST: Professional fashion photography. A sophisticated woman wearing black leather knee-high boots with buckles (the hero product) from the user's uploaded image, sitting gracefully on a pristine green tennis court, reading a newspaper. The composition is calm and luxurious. Full-length view of the woman, with the boots clearly visible and extending to the ground.

SCENE COMPOSITION:
- Frame: Full-length shot
- Subject wearing: white elegant dress
- Product (hero): black leather knee-high boots with buckles
- Setting: pristine green tennis court
- Mood: elegant, serene ambiance, in line with a luxurious and calm mood
- Lighting: Soft, warm natural lighting
- Depth of field: Shallow depth of field
- Padding: 10-15% at top/bottom to prevent cropping
- Text space: Top 20% clear for text overlay

SCENE: Clean product photography with minimal background

TEXT OVERLAY REQUIREMENTS:
🚨 CRITICAL: You MUST include text overlays in the generated image. Text is not optional.

Generate the following text directly rendered into the image:

Text 1: "Botas "el Uli"
- Typography: serif elegant (thin strokes, flowing style)
- Weight: regular
- Case: title-case
- Color: black
- Vertical Position: 40% from top edge
- Size: large (relative to canvas)
- Alignment: center
- Letter Spacing: normal


Text 2: "50% off en toda la tienda"
- Typography: script elegant
- Weight: regular
- Color: black
- Vertical Position: 45% from top edge
- Spacing: tight (5-10%) gap from headline above
- Size: medium (relative to canvas)
- Alignment: center
- Letter Spacing: normal


PRODUCT DOMINANT COLORS: #F6F4EF, #2E2F31, #B2B1AE
IMPORTANT: Ensure text has excellent contrast against the background. If the product or background uses similar colors to the text, adjust the text color or add subtle shadows/outlines for readability.

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

🚨 TEXT SPELLING ACCURACY - CRITICAL:
⚠️ PERFECT SPELLING IS MANDATORY: Each word MUST be rendered with 100% accurate spelling, letter by letter.
- Before generating, mentally spell out each word character-by-character
- Double-check EVERY letter in EVERY word before finalizing
- Pay special attention to Spanish characters: ñ, á, é, í, ó, ú
- Common mistakes to avoid:
  * Mixing 'j' and 'h' sounds (e.g., "agujeros" has 'j', not 'h')
  * Missing or wrong letters in middle of words (e.g., "hermana" not "harmana")
  * Confusing similar-looking letters (e.g., 'o' vs '0', 'l' vs 'I')
- VERIFICATION STEP: After rendering text, verify spelling matches EXACTLY what was specified above

🚨 TEXT GENERATION IS MANDATORY: The output image MUST contain the specified text overlays. Do not generate an image without text.

OUTPUT REQUIREMENTS:
- 1:1 aspect ratio
- Photorealistic, high quality
- Product must be clearly visible and featured (but GENERATED, not pasted from product image)
- Professional advertising quality with text integrated naturally
- Text should be crisp, clear, and readable
- VERIFY: All specified text elements are present and visible in the output

```

## Summary

- Length difference: 3 characters (0.1%)
- Iteration time: Current (5-10 min) vs Agent (30 sec)
- Editability: Current (developers only) vs Agent (anyone)
