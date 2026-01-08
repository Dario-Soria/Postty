# Test Environment: Prompt-Driven Image Generation

This folder contains an isolated test environment to experiment with prompt-based image generation using Gemini 2.5 Flash Image.

**Philosophy:** The prompt template should control everything. To improve results, edit the prompt - not the code.

---

## 🎯 Quick Start

### 1. Run Current Production Method

Uses the hardcoded prompt from `prompt.md`:

```bash
npx ts-node test/test-generate.ts --mode=current
```

### 2. Run New Agent Method

Uses the dynamic template from `prompt-template-section.md`:

```bash
npx ts-node test/test-generate.ts --mode=agent
```

### 3. Compare Both Approaches

```bash
npx ts-node test/compare-prompts.ts
```

### 4. View Results

```bash
open test/results/current_*.png    # Production method output
open test/results/agent_*.png      # Agent method output
```

---

## 📁 Files in This Folder

### Core Files

- **`test-generate.ts`** - Main test script with two modes (current/agent)
- **`agent-prompt-builder.ts`** - Builds prompts dynamically from template
- **`compare-prompts.ts`** - Compares current vs agent approaches
- **`iteration-guide.md`** - Complete guide to iterating on prompts

### Template Files

- **`prompt-template-section.md`** - The agent's Gemini prompt template (EDIT THIS!)
- **`prompt.md`** - Current production prompt (for comparison)

### Input Files

- **`reference.jpg`** - Reference image for style matching
- **`product.webp`** - Product image (place your product here)

### Output Files

- **`results/`** - Generated images saved here
- **`comparison-report.md`** - Detailed prompt comparison (auto-generated)

---

## 🔄 The Two Approaches

### Current Approach (Hardcoded)

**How it works:**
- Prompt template is hardcoded in `src/services/nanoBananaGenerator.ts` (TypeScript)
- To change: Edit code → Restart server → Test

**Pros:**
- Already in production
- Well-tested

**Cons:**
- Slow iteration (5-10 minutes per change)
- Only developers can modify
- All agents share the same template

### Agent Approach (Dynamic)

**How it works:**
- Prompt template lives in `prompt-template-section.md` (Markdown)
- Code reads template and fills in variables
- To change: Edit markdown → Test

**Pros:**
- Fast iteration (30 seconds per change)
- Anyone can modify (no coding needed)
- Each agent can have its own template

**Cons:**
- New approach (needs testing)

---

## 🚀 Iteration Workflow

This is THE recommended workflow for improving image generation:

### 1. Generate Test Image

```bash
npx ts-node test/test-generate.ts --mode=agent
```

### 2. Review Output

```bash
open test/results/agent_*.png
```

### 3. Edit Template

Not satisfied? Edit `prompt-template-section.md`:

```markdown
BEFORE:
- Lighting: Natural lighting

AFTER:
- Lighting: Soft natural window light from 45° left, creating gentle wrap-around
```

### 4. Test Again

```bash
npx ts-node test/test-generate.ts --mode=agent
```

### 5. Repeat

Each iteration takes ~30 seconds. Run dozens of tests to perfect the prompt!

---

## 📝 Example: Fixing the White Dress Issue

**Problem:** Gemini sometimes generates black dress instead of white

**Solution:** Edit `prompt-template-section.md`

```markdown
Find this section:

SCENE COMPOSITION:
- Subject wearing: [OUTFIT_DESCRIPTION]

Add explicit color requirement:

SCENE COMPOSITION:
- Subject wearing: [OUTFIT_DESCRIPTION]
- 🚨 CRITICAL: Outfit colors are MANDATORY
- Model wearing WHITE elegant dress (not black, not gray, WHITE)
```

Save file → Run test → Check if fixed → Iterate again if needed

**No code changes. No server restart. Just edit markdown.**

---

## 🔬 A/B Testing Different Prompts

Want to test different lighting styles?

### Test 1: Soft Natural

Edit `prompt-template-section.md`:

```markdown
- Lighting: Soft natural window light, diffused daylight
```

Run:

```bash
npx ts-node test/test-generate.ts --mode=agent
# Saves to: test/results/agent_1234567890.png
```

### Test 2: Golden Hour

Edit `prompt-template-section.md`:

```markdown
- Lighting: Golden hour lighting, warm sunset glow
```

Run:

```bash
npx ts-node test/test-generate.ts --mode=agent
# Saves to: test/results/agent_1234567891.png
```

### Compare

```bash
open test/results/agent_1234567890.png
open test/results/agent_1234567891.png
```

Pick the better approach!

---

## 📊 Understanding the Comparison

Run the comparison tool:

```bash
npx ts-node test/compare-prompts.ts
```

This shows you:

### Current Approach
- ⏱️ Iteration: 5-10 minutes
- 👥 Who: Developers only
- 📁 Location: TypeScript code
- 🔄 Server: Restart required

### Agent Approach
- ⏱️ Iteration: 30 seconds
- 👥 Who: Anyone
- 📁 Location: Markdown file
- 🔄 Server: No restart needed

If agent approach produces equal/better results with 10x faster iteration, that's a huge win!

---

## 🎨 Common Improvements

See `iteration-guide.md` for detailed examples, but here are quick fixes:

### Wrong Colors
Add: "🚨 CRITICAL: [COLOR] is MANDATORY, not optional"

### Text Positioning Off
Add: "Text MUST appear in top 20% of canvas"

### Product Cropped
Add: "NO cropping of product at any point, full visibility required"

### Typography Doesn't Match
Add: "Study reference typography CHARACTER BY CHARACTER, replicate exact stroke weight"

---

## 🚀 Going to Production

Once you're happy with the agent template:

1. **Copy refined template**
   - From: `test/prompt-template-section.md`
   - To: `Agents/Product Showcase/prompt.md` (add as new section)

2. **Update production code**
   - Modify `src/services/nanoBananaGenerator.ts`
   - Make it read template from agent's `prompt.md`
   - Build prompt dynamically instead of using hardcoded template

3. **Repeat for all 4 agents**
   - Each agent gets its own optimized template
   - Independent iteration per agent style

---

## 💡 Pro Tips

1. **Be Specific, Not Generic**
   - ❌ "Natural lighting"
   - ✅ "Soft window light from 45° left creating gentle wrap-around"

2. **Use Emojis for Critical Instructions**
   - 🚨 CRITICAL
   - 🎯 IMPORTANT
   - ⚠️ WARNING

3. **Test Edge Cases**
   - Different colors
   - Different text lengths
   - Different product types

4. **Iterate Rapidly**
   - Don't overthink
   - Make small changes
   - Test immediately

5. **Keep Production Running**
   - This is an isolated test environment
   - Nothing here affects production
   - Experiment freely!

---

## 📚 Documentation

- **`iteration-guide.md`** - Complete iteration workflows and examples
- **`prompt-template-section.md`** - The template itself (well-commented)
- **`comparison-report.md`** - Auto-generated comparison (run compare-prompts.ts)

---

## ⚙️ Technical Details

### Test Script (`test-generate.ts`)

Both modes use EXACTLY the same:
- ✅ API: `@google/generative-ai` library
- ✅ Model: `gemini-2.5-flash-image`
- ✅ Config: temperature 0.4, topP 0.95, topK 40
- ✅ Parts: [prompt text, reference image, product image]

**ONLY DIFFERENCE:** Where the prompt text comes from

- Current mode: Reads `prompt.md` (hardcoded)
- Agent mode: Builds from `prompt-template-section.md` (dynamic)

### Prompt Builder (`agent-prompt-builder.ts`)

Simple class that:
1. Reads the template markdown
2. Replaces placeholders with actual values
3. Returns complete prompt string

Example:
```typescript
const builder = new AgentPromptBuilder();
const prompt = builder.buildCompletePrompt({
  userDescription: "...",
  framingType: "Full-length shot",
  outfitDescription: "white elegant dress",
  // ... more params
});
```

---

## 🎯 Success Criteria

You know your prompt is working when:

1. ✅ Image matches reference vibe
2. ✅ Product is hero of composition
3. ✅ Typography matches reference
4. ✅ Text is crisp and readable
5. ✅ Colors are accurate
6. ✅ No cropping of product
7. ✅ Professional advertising quality

---

## 🆘 Troubleshooting

### "GEMINI_API_KEY not found"
Make sure `.env` file exists in project root with your API key.

### "Product image not found"
Place your product image as `test/product.webp` (or .jpg, .png)

### "Template file not found"
Make sure `test/prompt-template-section.md` exists

### "Generated image is very different from reference"
This is expected - Gemini is creative! Edit the template to add more specific constraints.

### "Text spelling is wrong"
The spelling accuracy section in the template should help, but Gemini is not perfect. Consider emphasizing the correct spelling even more.

---

## 📞 Need Help?

1. Read `iteration-guide.md` for detailed examples
2. Run `compare-prompts.ts` to understand differences
3. Check `comparison-report.md` for full prompt text
4. Review generated images in `test/results/`

---

**Remember:** The prompt is your code. Change prompts, not TypeScript! 🎨
