# Reference Image Generation Issue - Full Diagnosis

**Date:** January 7, 2026  
**Issue:** Generated images not matching reference image style and typography

---

## 🔍 Issue Summary

You requested a "woman playing tennis" image and although:
- ✅ The correct tennis reference was selected (after re-indexing with improved tags)
- ✅ The reference image was sent to Nano Banana generator
- ❌ The **output completely ignored** the reference image's style and typography

### What You Observed:

| Reference Image (bba50...jpg) | Generated Image |
|-------------------------------|-----------------|
| Elegant white flowing dress | Casual white tank + denim shorts |
| Serif elegant typography | Sans-serif modern typography |
| Text on RIGHT side (centered vertically) | Text at TOP LEFT |
| "You're in your wellness era." | "Maximiza el aire en tus bolas" |
| Editorial/wellness aesthetic | Sporty/casual aesthetic |
| Motion blur, dynamic pose | Static pose |

---

## 🔬 Root Cause Analysis

### Problem #1: Incorrect Database Design Guidelines ❌

The `design_guidelines` stored in SQLite for the tennis reference are **completely wrong**:

**Database says:**
```json
{
  "font_style": "sans-serif",
  "font_character": "modern",
  "position": "top-right",
  "position_y_percent": "15"
}
```

**Image actually shows:**
- Font: **SERIF** (elegant, sophisticated - like Playfair Display)
- Position: **RIGHT-CENTER** (approximately x: 70-85%, y: 35-45%)
- Character: **elegant, luxury, wellness**

**Why it happened:**
- The `AnalyzerPrompt.md` lacks clear instructions for font detection
- Position terminology is vague ("top-right" is ambiguous)
- No validation to catch obvious errors
- Gemini Vision misinterpreted the typography during indexing

---

### Problem #2: Gemini 2.5 Flash Image Limitations ❌

Even if the database had correct guidelines, **Nano Banana cannot use them properly**:

**What the code attempts:**
1. Send reference image + product image to `gemini-2.5-flash-image`
2. Send typography instructions: "Study the REFERENCE IMAGE typography"
3. Expect Gemini to analyze the reference and match its style

**What actually happens:**
- ❌ Gemini 2.5 Flash Image **cannot analyze** reference images for typography
- ❌ It only uses images as general "style inspiration"
- ❌ It follows the TEXT description, not the visual reference
- ❌ Result: Ignores reference completely, uses text guidelines blindly

**Evidence from logs:**
```
Typography: sans-serif modern regular, sentence-case (clean, simple font)
Position: top-right
Position Y%: 15
```
→ Gemini placed text exactly as described in text, not as shown in reference image

---

### Problem #3: Ambiguous Position Terminology ❌

The current system uses vague position terms:
- "top-right" could mean:
  - Top of image + right side = top-right corner
  - Centered vertically on the right side
  - Top 20% + right alignment
  
**Gemini interpreted "top-right" as:** Top area with right-ish placement → resulted in TOP-LEFT text

**Better approach:** Use precise coordinates:
```json
{
  "position_x_percent": 75,
  "position_y_percent": 40,
  "anchor": "left-aligned"
}
```

---

## ✅ Solutions Required

### Solution 1: Improve AnalyzerPrompt.md (DO NOT IMPLEMENT YET)

**Changes needed in `reference-library/AnalyzerPrompt.md`:**

1. **Add font detection rules:**
```markdown
## Font Style Detection Rules

To determine if text is SERIF or SANS-SERIF, examine letter terminals closely:

**SERIF fonts have:**
- Small decorative strokes at the ends of letters (serifs)
- Examples: Letters like "I", "T", "E" have small feet/caps
- Common in: Editorial, luxury, wellness, traditional brands
- Examples: Playfair Display, Garamond, Bodoni, Didot

**SANS-SERIF fonts have:**
- Clean, straight letter endings without decoration
- Modern, minimalist appearance
- Common in: Tech, fitness, casual brands
- Examples: Helvetica, Arial, Roboto, Montserrat

**SCRIPT fonts have:**
- Flowing, handwritten appearance
- Connected or decorative letterforms
- Common in: Luxury, beauty, creative brands
```

2. **Use precise positioning:**
```markdown
## Position Guidelines

Use TWO separate fields for clarity:

**position_x_percent:** Horizontal placement (0-100)
- 0-20: left
- 30-40: left-center
- 45-55: center
- 60-70: right-center
- 80-100: right

**position_y_percent:** Vertical placement (0-100)
- 0-15: top
- 20-40: upper-middle
- 45-55: center
- 60-80: lower-middle
- 85-100: bottom

Example: Text on the right side, vertically centered:
{
  "position_x_percent": 75,
  "position_y_percent": 40
}
```

3. **Add validation requirements:**
```markdown
## Critical Accuracy Requirements

Before finalizing typography analysis:
1. Zoom into text and examine letter shapes carefully
2. Verify serif/sans-serif by checking multiple letters
3. Measure text position as percentage from edges
4. Describe font character based on actual appearance, not assumption
5. If unsure, describe what you SEE rather than guessing
```

---

### Solution 2: Change Generation Strategy (CRITICAL - DO NOT IMPLEMENT YET)

**Current flawed approach:**
```
Reference Image + Product Image + Text Instructions
    ↓
Gemini 2.5 Flash Image (Nano Banana)
    ↓
Final Image with Text
```

**Problems:**
- Gemini cannot analyze reference typography
- Text generation is unreliable
- Style matching doesn't work

**Recommended approach (was working before!):**

```
Reference Image + Product Image (NO TEXT)
    ↓
Gemini 2.5 Flash Image (Nano Banana)
    ↓
Base Image (no text)
    ↓
Canvas/HTML Overlay (separate step)
    ↓
Final Image with Accurate Text
```

**Changes needed:**
1. **In `nanoBananaGenerator.ts`:**
   - Remove text generation logic
   - Always generate clean base images
   - Return base image only

2. **In `pipelineOrchestrator.ts`:**
   - After base image generation, add text using canvas overlay
   - Use design_guidelines for text styling
   - This gives precise control over typography

3. **Benefits:**
   - Accurate text positioning (pixel-perfect)
   - Correct font styles (you control which fonts to use)
   - Better reliability (no AI interpretation)
   - This is what was working in the previous version!

---

### Solution 3: Add Validation Layer (DO NOT IMPLEMENT YET)

After indexing, verify design_guidelines quality:

```typescript
// Add to scripts/index-reference-images.ts
function validateTypography(guidelines: any, imagePath: string): ValidationResult {
  const errors = [];
  const warnings = [];
  
  // Check font style is valid
  const validFontStyles = ['serif', 'sans-serif', 'script', 'display'];
  if (!validFontStyles.includes(guidelines.typography.headline.font_style)) {
    errors.push(`Invalid font_style: ${guidelines.typography.headline.font_style}`);
  }
  
  // Check position has clear meaning
  if (guidelines.typography.headline.position.includes('-')) {
    // Ambiguous like "top-right"
    warnings.push('Position uses ambiguous terminology - consider using percentages');
  }
  
  // Check Y position is reasonable
  const yPercent = parseInt(guidelines.typography.headline.position_y_percent);
  if (isNaN(yPercent) || yPercent < 0 || yPercent > 100) {
    errors.push(`Invalid position_y_percent: ${yPercent}`);
  }
  
  return { errors, warnings, passed: errors.length === 0 };
}
```

---

### Solution 4: Re-index After Prompt Improvements (DO NOT IMPLEMENT YET)

Once AnalyzerPrompt.md is fixed:

```bash
npm run index-references -- --force
```

This will re-analyze all 15 reference images with the improved prompt.

---

## 📊 Current Database State

All 15 reference images have design_guidelines, but many are likely inaccurate:

```
1. 1221244e4701b242ec2cfc5015f98b4a.jpg: serif elegant, top (Y: 5%)
2. 1c1d9579463f91193da7b26507b4dde9.jpg: sans-serif modern, top (Y: 10%)
3. 32a7e06425ddce12740b65a36346fb20.jpg: script elegant, top (Y: 10%)
...
12. bba50f346d896c926edbf0d75709d70b.jpg: sans-serif modern, top-right (Y: 15%) ❌ WRONG
...
```

**Recommended:** Manually verify 2-3 images against their design_guidelines to assess error rate.

---

## 🎯 Priority Actions

**CRITICAL (Do First):**
1. **Change generation strategy** - Revert to separate text overlay
   - This fixes the immediate issue
   - Base image generation + canvas text overlay = reliable results

**HIGH (Do Next):**
2. **Improve AnalyzerPrompt.md** - Add font detection rules and precise positioning
   - This fixes the data quality issue
   - Better guidelines = better future results

**MEDIUM (Do After):**
3. **Re-index all references** - Get accurate design_guidelines
   - Once prompt is fixed, re-analyze all images
   - Improves search and matching quality

**LOW (Optional):**
4. **Add validation layer** - Catch errors during indexing
   - Prevents bad data from entering database
   - Improves long-term data quality

---

## 💡 Key Insights

1. **Gemini 2.5 Flash Image cannot read reference typography** - it only uses images as loose style inspiration
2. **Text generation should be separate from image generation** - gives you full control
3. **The indexing prompt needs significant improvements** - current typography detection is unreliable
4. **Position terminology must be precise** - "top-right" is too ambiguous

---

## 🚀 Next Steps

1. **DECISION NEEDED:** Should we revert to the working text overlay approach?
2. **DECISION NEEDED:** Should we improve the AnalyzerPrompt now or later?
3. **DECISION NEEDED:** Should we re-index all references or just fix specific ones?

**Recommendation:** Start with #1 (revert to text overlay) since that immediately fixes the issue.

