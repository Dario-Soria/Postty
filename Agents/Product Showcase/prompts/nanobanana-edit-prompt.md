# NANOBANANA EDIT PROMPT TEMPLATE - VERSION 3 (STABLE)

> **DO NOT EDIT without explicit permission from the user.**
> **Last verified:** 2026-01-31

## For ProductShowcase Agent Use - Revision Mode

### FIXED TEMPLATE (EDIT MODE)

```
=== ROLE ===
You are an expert Instagram product post designer. Your job is to make ONLY the requested changes to an existing image.

=== OBJECTIVE ===
Take the PROVIDED IMAGE and apply ONLY the specific changes listed below. Everything else must remain identical.

=== CRITICAL CONSTRAINT ===
You are NOT creating a new image. You are editing an existing one.
- DO NOT reinterpret the image
- DO NOT add creative improvements
- DO NOT change anything not explicitly requested
- DO NOT modify composition, lighting, colors, or any other element unless specifically asked

=== ORIGINAL REFERENCE STYLE (for context) ===
The user selected a reference with these characteristics:
{reference_style_section}
If the user mentions "reference" or "original", they mean this style.

=== REQUESTED CHANGES ===
{user_changes}

=== ELEMENTS TO PRESERVE (DO NOT TOUCH) ===
- Product appearance and position
- Background and all props
- Lighting and shadows
- Color palette and grading
- Composition and framing
- Text style, font, color, and position (if present)
- Overall mood and atmosphere
- Every single detail NOT mentioned in REQUESTED CHANGES

=== IMMUTABLE RULES ===
1. Format: Instagram Post 4:5 (1080x1350px) - MUST remain the same
2. Change ONLY what is explicitly requested - nothing more
3. NO spelling errors if text is modified
4. NO creative liberties or "improvements"
5. NO reinterpretation of the image
6. The output must be identical to the input EXCEPT for the requested changes
7. If in doubt, DO NOT change it
8. Commercial advertising quality must be maintained
9. ASPECT RATIO 4:5 IS MANDATORY: The output MUST be 4:5. NEVER add padding, whitespace, or black bars.
```

### VARIABLES

| Variable | Source |
|----------|--------|
| `{user_changes}` | Accumulated user feedback (original design_changes + new edits) |
| `{reference_style_section}` | Extracted from `self.selected_reference.design_guidelines` |

### REFERENCE STYLE SECTION

The `{reference_style_section}` is built from the original reference's design_guidelines:

```
- Background: {type}, colors {colors}, {elements}
- Lighting: {type}, {color_temperature}
- Colors: primary {primary}, secondary {secondary}, {temperature}
- Style: {aesthetic}, mood {mood}
```

This provides context so NanoBanana understands when user says "like the reference" or "original style".

### VERSION HISTORY

| Version | Changes |
|---------|---------|
| V1 | Basic edit template |
| V2 | Added ORIGINAL REFERENCE STYLE section with design_guidelines |
| V3 | Added Rule 9: ASPECT RATIO 4:5 MANDATORY - No padding or whitespace |

### KEY DIFFERENCE FROM GENERATE PROMPT

| Aspect | Generate | Edit |
|--------|----------|------|
| Reference Image | S3 URL of selected reference | Absolute path to `last_generated_image` |
| Product Image | User's uploaded product | User's uploaded product |
| Purpose | Create new image from reference | Modify existing generated image |
| Context | None needed | Includes original reference style |

### AGENT INSTRUCTIONS

1. Always use this template for edits - Do not improvise
2. Reference image is the `last_generated_image` (absolute path)
3. Include the original reference design_guidelines for context
4. Extract user changes exactly - Do not interpret or expand
5. Be literal - If user says "make text bigger", write exactly that
6. Do not add context - No explanations about why the change is needed
7. Keep changes minimal - Only what user explicitly requested

---
**Implemented in:** `agent.py` function `_build_nanobanana_edit_prompt()` - VERSION 3 (STABLE)
**Pipeline Handler:** `_handle_edit_pipeline()` - VERSION 2 (uses `last_generated_image`)
