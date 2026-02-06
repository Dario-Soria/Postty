# NANOBANANA GENERATE PROMPT TEMPLATE - VERSION 4 (STABLE)

> **DO NOT EDIT without explicit permission from the user.**
> **Last verified:** 2026-01-31

## For ProductShowcase Agent Use - Generation Mode

### FIXED TEMPLATE (GENERATE MODE)

```
=== ROLE ===
You are an expert Instagram product post designer. Your job is to replicate visual references with different products.

=== OBJECTIVE ===
Take the REFERENCE IMAGE and recreate it exactly, but replace the original product with MY PRODUCT.

=== MY PRODUCT ===
- Type: {product_type}
- Name: {product_name}
- Visual: Use the product image I provided (attached)

=== CRITICAL: PRODUCT REPLACEMENT ===
- The product shown in the REFERENCE IMAGE MUST BE COMPLETELY REMOVED
- ONLY MY PRODUCT (the one I uploaded/attached) should appear in the final image
- DO NOT show any part of the original product from the reference
- The reference is ONLY for style, composition, lighting, and background - NOT for the product itself
- If the reference shows a jar, bottle, tube, or any product: REMOVE IT and put MY PRODUCT instead

=== AUTOMATIC COLOR ADAPTATION ===
- ALWAYS adapt the BACKGROUND COLORS (gradients, ambient tones, overall atmosphere) to harmonize with MY PRODUCT's color palette
- The background should complement and enhance MY PRODUCT as the visual center
- DO NOT change colors of specific props or decorative objects - only background/ambient colors
- The final image should feel cohesive, with colors that naturally complement my product

=== REFERENCE IMAGE ===
Use the reference ONLY for:
- Composition and framing (where to place MY product)
- Lighting (direction, intensity, temperature)
- Color palette and mood
- Background and props (NOT the product!)
- Photographic style
- Atmosphere/mood

=== REQUESTED CHANGES ===
{changes_section}
(If no changes: "- None. Keep reference exact.")

=== TEXT ===
{text_section}
(If text: Include the following text maintaining EXACTLY the same typographic style, color, size and position as the reference)
(If no text: "- No text.")

=== IMMUTABLE RULES ===
1. Format: Instagram Post 4:5 (1080x1350px)
2. The ORIGINAL PRODUCT from the reference MUST NOT appear - replace it 100% with MY PRODUCT
3. DO NOT invent elements not present in the reference
4. DO NOT modify anything the user did not request
5. NO spelling errors in text
6. MY PRODUCT must look professional and be the protagonist
7. Commercial advertising quality
8. If there is text, it must be 100% legible
9. Maintain total visual coherence with the reference (except the product)
10. When in doubt: REMOVE the reference product, KEEP everything else
```

### VARIABLES

| Variable | Source in agent.py |
|----------|-------------------|
| `{product_type}` | `self.product_category` |
| `{product_name}` | `self.product_name` |
| `{changes_section}` | `self.design_changes` processed by `_interpret_user_changes()` |
| `{text_section}` | `self.text_content` (headline, subheadline, cta) |

### VERSION HISTORY

| Version | Changes |
|---------|---------|
| V1 | Basic template structure |
| V2 | Added `_interpret_user_changes()` to process design changes with LLM |
| V3 | Added CRITICAL PRODUCT REPLACEMENT section |
| V4 | Added AUTOMATIC COLOR ADAPTATION section |

### AGENT INSTRUCTIONS

1. Always use this template - Do not improvise prompts
2. Fill each section with collected information
3. Be specific in MY PRODUCT - Extract all visible details
4. If no changes, write "None. Keep reference exact."
5. If no text, write "No text."
6. Attach both images (product + reference) along with this prompt
7. The `_interpret_user_changes()` function reformulates user input before adding to prompt

---
**Implemented in:** `agent.py` function `_build_nanobanana_prompt()` - VERSION 4 (STABLE)
