# Scripts Documentation

## Reference Library Image Indexer

### Overview

The `index-reference-images.ts` script batch processes all images in the `reference-library/images` folder, analyzing them with Gemini AI and storing metadata in the SQLite database.

### What It Does

1. **Scans** all images (`.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`) in `reference-library/images`
2. **Checks** which images are already indexed in the database
3. **Analyzes** new or unindexed images using Gemini AI to extract:
   - Descriptive text
   - Keywords (up to 12 per image)
4. **Stores** metadata in `reference-library/index.sqlite`:
   - SHA256 hash (for deduplication)
   - Image dimensions, file size, MIME type
   - Keywords and description
   - File path
5. **Preserves** original filenames (important for paired JSON metadata files)

### Usage

#### Basic Usage

Index all new images (skips already indexed):

```bash
npm run index-references
```

#### Force Re-index

Re-analyze and update ALL images, even if already indexed:

```bash
npm run index-references -- --force
```

#### Limit Processing

Process only the first N images (useful for testing):

```bash
npm run index-references -- --limit 5
```

#### Combined Options

```bash
npm run index-references -- --force --limit 10
```

### Example Output

```
═══════════════════════════════════════════════════════════════
🔍 Reference Library Image Indexer
═══════════════════════════════════════════════════════════════

📂 Scanning: /Users/you/Postty v4.0/reference-library/images

📊 Found 34 image file(s)

[1/34] Processing: 19.png
  ✨ Indexing new image: 19.png
  ✓ Indexed with 12 keywords (filename preserved for JSON pairing)

[2/34] Processing: 455b905fb56f6bc30c66ab085a0e2f30.jpg
  ✨ Indexing new image: 455b905fb56f6bc30c66ab085a0e2f30.jpg
  ✓ Indexed with 10 keywords (filename preserved for JSON pairing)

[3/34] Processing: 1766066280535_ref_24c2803d.png
  ✓ Already indexed (skip)

...

═══════════════════════════════════════════════════════════════
📊 Summary:
   Total processed: 34
   ✓ Succeeded:     28
   → Skipped:       6
   ✗ Failed:        0
═══════════════════════════════════════════════════════════════

✅ All images indexed successfully!
```

### When to Use

- **After manually adding images** to the `reference-library/images` folder
- **Initial setup** when you have a collection of reference images
- **Re-indexing** if you upgrade the Gemini model or want better keywords
- **Quality check** to ensure all images have proper metadata

### Requirements

- **Environment variable**: `GEMINI_API_KEY` must be set (uses Gemini AI for analysis)
- **Dependencies**: `better-sqlite3`, `sharp`, `@google/genai` (already in package.json)

### Database Schema

The script creates/uses this table structure:

```sql
CREATE TABLE reference_images (
  id TEXT PRIMARY KEY,
  sha256 TEXT UNIQUE,
  original_filename TEXT,
  stored_path TEXT,
  mime TEXT,
  bytes INTEGER,
  width INTEGER,
  height INTEGER,
  created_at TEXT,
  keywords_json TEXT,  -- JSON array of keywords
  description TEXT     -- Human-readable description
);
```

### File Naming Convention

**Important**: Files are **NOT renamed**. Original filenames are preserved because:

- Images may have paired JSON metadata files (e.g., `image.jpg` + `image.json`)
- Renaming would break the pairing
- Keywords are stored in the database for searching/filtering

Example:
```
455b905fb56f6bc30c66ab085a0e2f30.jpg  ← Original filename preserved
455b905fb56f6bc30c66ab085a0e2f30.json ← Paired metadata (if exists)
```

The database stores all metadata including keywords, so you can:
- Query images by keywords via SQL
- Keep image-JSON pairs intact
- Maintain your original file organization

### Error Handling

- **Deduplication**: Images with the same SHA256 hash are only indexed once
- **Missing keywords**: Images in the database without keywords are automatically re-analyzed
- **API failures**: If Gemini API fails for an image, it's logged but doesn't stop processing
- **Filename preservation**: Original filenames are always kept to maintain JSON pairing

### Tips

1. **Start small**: Use `--limit 5` to test with a few images first
2. **Check API costs**: Gemini API calls are made for each new/unindexed image
3. **Backup first**: Consider backing up `index.sqlite` before using `--force`
4. **Run periodically**: Add to your workflow after importing new reference images

### Troubleshooting

**Error: better-sqlite3 is not installed**
```bash
npm install better-sqlite3
```

**Error: GEMINI_API_KEY environment variable is not set**
```bash
export GEMINI_API_KEY=your_api_key_here
# Or add to .env file
```

**Images not being indexed**
- Check file permissions
- Ensure files are valid images (not corrupted)
- Verify file extensions are supported

**Want to see more details**
- Check console output - each image shows its processing status
- Look for specific error messages per file

---

## Other Scripts

### `rembg_cutout.py`

Background removal script using the rembg library.

See `requirements-rembg.txt` for dependencies.

