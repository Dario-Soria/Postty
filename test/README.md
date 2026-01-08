# Nano Banana Prompt Testing Environment

This is an isolated test environment for iterating on the Nano Banana (Gemini 2.5 Flash Image) generation prompt without affecting the main system.

## 📁 Contents

- **`prompt.md`** - The exact prompt sent to Gemini (edit this!)
- **`reference.jpg`** - Reference image for style inspiration (cd685fd...)
- **`product-placeholder.txt`** - Instructions for adding product image
- **`test-generate.ts`** - Standalone script to call Gemini API
- **`results/`** - Output folder for generated images

## 🚀 Quick Start

### 1. Add Your Product Image

**REQUIRED:** You need to add a product image before running tests.

```bash
# Copy your product image to the test folder
# Name it one of: product.webp, product.jpg, or product.png

cp /path/to/your/product-image.webp test/product.webp
```

The original generation used black leather knee-high boots. Use the same product image you want to test with.

### 2. Run Your First Test

```bash
# Make sure you have GEMINI_API_KEY set
export GEMINI_API_KEY="your-api-key-here"

# Run the test
npx ts-node test/test-generate.ts
```

This will:
- Read `prompt.md`, `reference.jpg`, and your product image
- Send the request to Gemini 2.5 Flash Image
- Save the result to `results/test_TIMESTAMP.png`
- Show you the generation time and output details

### 3. Iterate on the Prompt

```bash
# Edit the prompt
code test/prompt.md  # or use your favorite editor

# Run another test
npx ts-node test/test-generate.ts

# Compare results in the results folder
ls -lh test/results/
```

## 📝 What's in the Prompt?

The `prompt.md` file contains the **exact prompt** that was sent to Gemini for generation `1767876654154_nanobanana_base.png`.

Key sections:
1. **TASK** - What we're asking Gemini to do
2. **INPUTS** - How to use the reference and product images
3. **USER REQUEST** - The scene description
4. **TEXT OVERLAY REQUIREMENTS** - Typography specifications
5. **TYPOGRAPHY MATCHING INSTRUCTIONS** - How to match reference style
6. **OUTPUT REQUIREMENTS** - Quality and format specifications

## 🔧 Advanced Usage

### Use a Custom Prompt File

```bash
# Create a modified version of the prompt
cp test/prompt.md test/prompt-v2.md

# Edit your custom prompt
code test/prompt-v2.md

# Run test with custom prompt
npx ts-node test/test-generate.ts --prompt=prompt-v2.md
```

### Compare Multiple Versions

```bash
# Run baseline
npx ts-node test/test-generate.ts
# Result: results/test_1767876640000.png

# Edit prompt
code test/prompt.md

# Run again
npx ts-node test/test-generate.ts
# Result: results/test_1767876650000.png

# Compare side-by-side
open results/test_*.png
```

## 🎯 Testing Strategy

Based on the diagnosis in `REFERENCE_GENERATION_DIAGNOSIS.md`, here are key areas to focus on:

### Problem Areas to Test:

1. **Text Position Accuracy**
   - Current: "Vertical Position: 40% from top edge"
   - Try: More specific positioning like "centered horizontally, 40% from top"
   - Try: Pixel-based positioning: "400px from top in a 1080px canvas"

2. **Font Description Clarity**
   - Current: "serif elegant (thin strokes, flowing style)"
   - Try: More specific fonts: "serif font similar to Playfair Display or Didot"
   - Try: More descriptive: "thin, high-contrast serif with elegant curves"

3. **Text Contrast/Readability**
   - Current: "Color: black"
   - Try: "Color: black with subtle white outline for readability"
   - Try: "Color: deep charcoal (#2C2C2C) with 50% opacity white shadow"

4. **Spelling Accuracy**
   - The prompt already has detailed spelling instructions
   - Test with different text to see if issues persist
   - Try: ALL CAPS vs Title Case vs sentence case

### Example Iterations:

**Iteration 1: Simplify Typography Instructions**
- Remove the long "TYPOGRAPHY MATCHING INSTRUCTIONS" section
- Make font descriptions more direct and specific
- See if simpler is better

**Iteration 2: Add Visual Examples**
- Add more explicit font references: "like Playfair Display", "like Great Vibes"
- Add percentage-based positioning: "centered at X=50%, Y=40%"

**Iteration 3: Focus on Contrast**
- Emphasize text readability and contrast
- Add explicit instructions about text effects (shadows, outlines)
- Test with different text colors

## 📊 Understanding Results

Each test generates:
- **Timestamp**: Unique identifier for each generation
- **Console output**: Shows request details and timing
- **PNG file**: The generated image in results/

Compare generations by:
1. Opening multiple images side-by-side
2. Checking text positioning accuracy
3. Verifying font style matches reference
4. Confirming spelling is correct
5. Assessing overall image quality

## ⚠️ Known Limitations

From the main diagnosis:

1. **Gemini 2.5 Flash Image cannot analyze reference typography visually**
   - It uses reference for general style only
   - Typography specs must be explicit in text
   - It doesn't "study" the reference font like the prompt claims

2. **Text generation is unreliable**
   - Sometimes text doesn't appear
   - Positioning may be inaccurate
   - Spelling errors can occur despite instructions

3. **Better approach may be separate text overlay**
   - Generate base image without text
   - Add text in post-processing with canvas/HTML
   - This gives pixel-perfect control

## 🧹 Cleanup

When you're done testing, just delete the test folder:

```bash
rm -rf test/
```

Or keep it for future reference and testing.

## 💡 Tips

1. **Start small** - Make one change at a time to see what works
2. **Document changes** - Keep notes on what you tried
3. **Compare results** - Look at multiple generations side-by-side
4. **Test edge cases** - Try very long text, special characters, etc.
5. **Check the reference** - Open `reference.jpg` to see what style you're matching

## 🐛 Troubleshooting

**"GEMINI_API_KEY not set"**
```bash
export GEMINI_API_KEY="your-key-here"
```

**"Product image not found"**
- Make sure you've added `product.webp`, `product.jpg`, or `product.png` to the test folder

**"No image data in response"**
- Check API quota/limits
- Verify API key is valid
- Check console output for API error messages

**Text doesn't appear in output**
- This is a known limitation of the model
- Try making text instructions more explicit
- Consider using the separate text overlay approach instead

## 📚 Related Files

- **Main prompt builder**: `src/services/nanoBananaGenerator.ts` (lines 118-308)
- **Full diagnosis**: `REFERENCE_GENERATION_DIAGNOSIS.md`
- **Reference indexer**: `reference-library/AnalyzerPrompt.md`

---

**Happy testing! 🧪**

