# Iteration Guide: Prompt-Driven Image Generation

This guide shows you how to rapidly iterate on image generation prompts without touching any code.

---

## 🎯 Core Philosophy

**The prompt template is your single source of truth.**

```
Bad results? → Edit prompt.md → Test → Repeat
            (NOT: Edit TypeScript code)
```

---

## 🚀 Quick Start (30-Second Iteration Loop)

### Step 1: Generate Test Image

```bash
npx ts-node test/test-generate.ts --mode=agent
```

Wait 10-20 seconds for generation.

### Step 2: Review Output

```bash
open test/results/agent_*.png
```

Not satisfied? Continue to Step 3.

### Step 3: Edit Template

```bash
code test/prompt-template-section.md
```

Or use any text editor - it's just markdown!

### Step 4: Test Again

```bash
npx ts-node test/test-generate.ts --mode=agent
```

### Step 5: Repeat Until Perfect

The loop takes ~30 seconds per iteration. You can run dozens of tests in the time it would take to do one code-based iteration.

---

## 📝 Common Improvements

### Problem: Wrong Colors

**Example:** Gemini generates black dress instead of white dress

**Solution:** Make color specifications more explicit

```markdown
BEFORE:
- Subject wearing: [OUTFIT_DESCRIPTION]

AFTER:
- Subject wearing: [OUTFIT_DESCRIPTION]
- 🚨 CRITICAL COLOR REQUIREMENT: The outfit color MUST be exactly as specified
- Pay extreme attention to color words - they are MANDATORY
- Model wearing WHITE elegant dress (not black, not gray, WHITE)
```

### Problem: Text Positioning is Off

**Example:** Text appears too low or overlaps with subject

**Solution:** Add explicit positioning constraints

```markdown
BEFORE:
- Vertical Position: [POSITION]% from top edge

AFTER:
- Vertical Position: [POSITION]% from top edge
- 🚨 CRITICAL: Measure exact pixel position in reference image
- Text MUST appear in top 20% of canvas
- Maintain minimum 5% margin from top edge
```

### Problem: Text is Illegible

**Example:** Text color blends with background

**Solution:** Add contrast requirements

```markdown
BEFORE:
IMPORTANT: Ensure text has excellent contrast against the background.

AFTER:
IMPORTANT: Text contrast is CRITICAL:
- If background is light (#F6F4EF), use dark text (#2E2F31)
- If background is dark, use light text (#FFFFFF)
- Add subtle shadow (2px black 20% opacity) if needed
- Text must be readable at arm's length on mobile device
```

### Problem: Typography Doesn't Match Reference

**Example:** Reference has elegant serif, output has modern sans-serif

**Solution:** Be more specific about font characteristics

```markdown
BEFORE:
- Match the font style (serif/sans-serif/script/display)

AFTER:
- Match the font style (serif/sans-serif/script/display)
- 🚨 REFERENCE ANALYSIS: Study the reference typography CHARACTER BY CHARACTER
  * Is it serif? → Note if traditional/modern/decorative
  * Is it script? → Note if elegant calligraphic/casual brush
  * Stroke weight: Thin/Regular/Bold
  * Letter spacing: Tight/Normal/Wide
  * Character mood: Elegant/Luxury/Playful/Bold
- REPLICATE these exact characteristics, not just the category
```

### Problem: Scene Framing Crops Product

**Example:** Boots are cut off at the ankles

**Solution:** Add explicit framing requirements

```markdown
BEFORE:
- Frame: [FRAMING_TYPE]

AFTER:
- Frame: [FRAMING_TYPE]
- 🚨 CRITICAL FRAMING: For fashion/apparel photography
  * Full-length shot means HEAD TO FEET visible
  * Camera pulled back to show complete outfit
  * Product (boots) must be fully visible touching ground
  * NO cropping of product at any point
  * Wide angle ensures complete figure fits with 10% padding
```

---

## 🔬 Advanced: A/B Testing

Compare different prompt variations:

### Test 1: Soft Natural Lighting

Edit `prompt-template-section.md`:

```markdown
- Lighting: Soft natural lighting, diffused daylight
```

Run test:

```bash
npx ts-node test/test-generate.ts --mode=agent
# Output: test/results/agent_1234567890.png
```

### Test 2: Golden Hour Lighting

Edit `prompt-template-section.md`:

```markdown
- Lighting: Golden hour lighting, warm sunset glow
```

Run test:

```bash
npx ts-node test/test-generate.ts --mode=agent
# Output: test/results/agent_1234567891.png
```

### Compare Results

```bash
open test/results/agent_1234567890.png
open test/results/agent_1234567891.png
```

Pick the better one, iterate further!

---

## 📊 Compare with Current Production

Want to see if agent mode is better than current production method?

### Generate Both Versions

```bash
# Current production method (hardcoded template)
npx ts-node test/test-generate.ts --mode=current

# New agent method (prompt.md template)
npx ts-node test/test-generate.ts --mode=agent
```

### Compare Prompts

```bash
npx ts-node test/compare-prompts.ts
```

This shows you:
- How the two prompts differ
- Iteration speed comparison (5-10 min vs 30 sec)
- Who can modify each approach (developers vs anyone)

### Compare Images

```bash
open test/results/current_*.png
open test/results/agent_*.png
```

If agent mode produces equal or better results with faster iteration, that's a win!

---

## 🎨 Real Example: Fashion Photography Iteration

**Starting Point:** Generic fashion shot

**Goal:** Match reference image's elegant, editorial style

### Iteration 1: Basic Template

```markdown
- Lighting: Natural lighting
- Mood: Fashion photography
```

**Result:** Generic, lacks character

### Iteration 2: More Specific

```markdown
- Lighting: Soft natural window light, slightly overcast for diffusion
- Mood: Editorial fashion, elegant and sophisticated
- Color grading: Warm tones, slightly desaturated for premium feel
```

**Result:** Better, but still not matching reference

### Iteration 3: Reference Analysis

```markdown
- Lighting: Soft natural window light from camera left, creating subtle directional shadows
- Mood: High-fashion editorial, calm confidence, understated luxury
- Color grading: Warm neutrals (cream, beige, soft browns) with muted blacks
- Composition: Asymmetric balance, subject slightly off-center
- Visual hierarchy: Product (boots) anchored at bottom, eyes guide down from headline
```

**Result:** Much closer to reference!

### Iteration 4: Fine-Tuning

```markdown
- Lighting: Soft natural window light from 45° camera left, diffused through sheer curtain
- Creating gentle wrap-around on subject, subtle rim light on hair
- Mood: High-fashion editorial, quiet confidence, accessible luxury
- Not aspirational luxury - real, wearable fashion
- Color grading: Warm neutrals (cream #F6F4EF, soft beige) with true blacks (#2E2F31)
- Avoid: Cool tones, harsh contrast, overly dramatic shadows
- Composition: Rule of thirds, subject occupies middle-right, negative space top-left for text
- Visual hierarchy: Eyes → Headline → Subject's gaze down → Product (boots)
```

**Result:** Perfect! Matches reference vibe while being unique

**Total time:** 4 iterations × 30 seconds = 2 minutes

With code-based approach: 4 iterations × 8 minutes = 32 minutes

---

## 💡 Pro Tips

### 1. Be Specific, Not Generic

❌ "Natural lighting"
✅ "Soft natural window light from 45° camera left, creating gentle wrap-around"

❌ "Fashion photography"
✅ "High-fashion editorial, quiet confidence, accessible luxury"

### 2. Use Reference Analysis Language

Don't just say "match the reference." Say:

- "Reference shows X, so replicate X"
- "Reference uses Y technique, so apply Y"
- "Reference has Z characteristic, so emphasize Z"

### 3. Add Constraints, Not Just Descriptions

❌ "Text should be readable"
✅ "Text must have 4.5:1 contrast ratio minimum (WCAG AA standard)"

❌ "Product should be visible"
✅ "Product must occupy 20-30% of frame, never cropped, always sharp focus"

### 4. Use Emojis for Critical Instructions

Gemini pays more attention to:
- 🚨 CRITICAL
- 🎯 IMPORTANT
- ⚠️ WARNING

Use these strategically for non-negotiable requirements.

### 5. Test Edge Cases

Try variations:
- Different lighting conditions
- Different color combinations
- Different text lengths
- Different product types

Make sure the template is robust!

---

## 🎯 Success Metrics

You know your iteration is successful when:

1. ✅ Image matches reference vibe
2. ✅ Product is hero of composition
3. ✅ Typography matches reference style
4. ✅ Text is crisp and readable
5. ✅ Colors are accurate (white dress = white dress!)
6. ✅ Framing doesn't crop product
7. ✅ Overall quality is professional advertising grade

---

## 🚀 Going to Production

Once you're happy with the template:

### Step 1: Add Template to Agent Prompt

Copy the refined template section from:
- `test/prompt-template-section.md`

To:
- `Agents/Product Showcase/prompt.md`

Add it as a new section at the end of the agent's prompt.

### Step 2: Update Production Code

Modify `src/services/nanoBananaGenerator.ts` to:
1. Read the agent's `prompt.md` file
2. Extract the "GEMINI PROMPT TEMPLATE" section
3. Build the prompt using the template + variables

### Step 3: Repeat for Other Agents

You have 4 agents, each can have its own unique template:
- Product Showcase Agent → Editorial fashion style
- Event Agent → Dynamic event photography
- Lifestyle Agent → Aspirational lifestyle shots
- Minimal Agent → Clean, minimalist product shots

Each template can be independently optimized!

---

## 📚 Further Reading

- See `test/compare-prompts.ts` for detailed comparison
- See `test/agent-prompt-builder.ts` for implementation details
- See `Agents/Product Showcase/prompt.md` for agent system prompt

---

**Remember:** The prompt is your code. Edit prompts, not TypeScript! 🎨

