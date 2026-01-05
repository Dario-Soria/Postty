# Reference Library Image Indexing

## Quick Start

### Index all new images in reference-library/images

```bash
npm run index-references
```

This will:
- ✅ Scan all images in `reference-library/images/`
- ✅ Skip images already indexed
- ✅ Analyze new images with Gemini AI
- ✅ Extract keywords and descriptions
- ✅ Store metadata in `reference-library/index.sqlite`
- ✅ **Preserve original filenames** (important for paired JSON metadata files)

### Force re-index everything

```bash
npm run index-references -- --force
```

Use this when:
- You want to update keywords for all images
- You've upgraded the Gemini model
- Existing keywords are poor quality

### Test with just 5 images

```bash
npm run index-references -- --limit 5
```

Good for:
- Testing before processing a large batch
- Checking if your GEMINI_API_KEY works
- Previewing the output format

## What Gets Stored

For each image, the database stores:

```json
{
  "id": "uuid",
  "sha256": "hash for deduplication",
  "original_filename": "original-name.jpg",
  "stored_path": "/full/path/to/image.jpg",
  "mime": "image/jpeg",
  "bytes": 123456,
  "width": 1080,
  "height": 1080,
  "created_at": "2025-01-02T12:34:56.789Z",
  "keywords_json": "[\"keyword1\", \"keyword2\", ...]",
  "description": "A vibrant social media post with..."
}
```

## How It Works

### 1. Automatic During Uploads

When you upload images via `/api/style-profile` or `/api/postty-architect` with reference images, they are **automatically indexed** in the background. No manual action needed!

### 2. Batch Processing (This Script)

For images you manually add to `reference-library/images/`, use this script to index them:

```bash
# Add images manually
cp ~/Downloads/new-references/*.jpg reference-library/images/

# Index them
npm run index-references
```

### 3. Filename Preservation

**Important**: The script **does NOT rename files**. Original filenames are preserved because:

- Images may have paired JSON metadata files (e.g., `image.jpg` + `image.json`)
- Renaming would break the pairing between image and metadata
- Keywords are stored in the database for searching/filtering

**Example:**
```
455b905fb56f6bc30c66ab085a0e2f30.jpg  ← Filename stays the same
455b905fb56f6bc30c66ab085a0e2f30.json ← Paired metadata (if exists)
```

The database stores:
```json
{
  "original_filename": "455b905fb56f6bc30c66ab085a0e2f30.jpg",
  "keywords_json": "[\"black\", \"friday\", \"sale\", \"banner\", \"red\"]",
  "description": "A vibrant Black Friday sale banner..."
}
```

This allows you to:
- Search images by keywords via database queries
- Keep image-JSON pairs intact
- Maintain original file organization

## Example Session

```bash
$ npm run index-references

> instagram-poster@1.0.0 index-references
> ts-node scripts/index-reference-images.ts

═══════════════════════════════════════════════════════════════
🔍 Reference Library Image Indexer
═══════════════════════════════════════════════════════════════

📂 Scanning: /Users/you/Code/Postty v4.0/reference-library/images

📊 Found 34 image file(s)

[1/34] Processing: 19.png
  ✨ Indexing new image: 19.png
  ✓ Indexed with 12 keywords (filename preserved for JSON pairing)

[2/34] Processing: 455b905fb56f6bc30c66ab085a0e2f30.jpg
  ✨ Indexing new image: 455b905fb56f6bc30c66ab085a0e2f30.jpg
  ✓ Indexed with 10 keywords (filename preserved for JSON pairing)

[3/34] Processing: 1766066280535_ref_24c2803d.png
  ✓ Already indexed (skip)

[4/34] Processing: ae12f96bf9839753ba7e37ee87fc3438.jpg
  ✨ Indexing new image: ae12f96bf9839753ba7e37ee87fc3438.jpg
  ✓ Indexed with 11 keywords (filename preserved for JSON pairing)

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

## Requirements

### Environment Variables

Make sure you have `GEMINI_API_KEY` set in your `.env` file:

```bash
GEMINI_API_KEY=your_gemini_api_key_here
```

### Dependencies

Already included in `package.json`:
- `better-sqlite3` (SQLite database)
- `sharp` (image metadata)
- `@google/genai` (Gemini AI)

## Troubleshooting

### "better-sqlite3 is not installed"

```bash
npm install better-sqlite3
```

### "GEMINI_API_KEY environment variable is not set"

Add to your `.env` file:
```
GEMINI_API_KEY=your_api_key_here
```

### Images not being processed

1. Check file permissions - script needs read/write access
2. Verify files are valid images (not corrupted)
3. Check supported formats: `.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`

### Want to check what's in the database?

```bash
sqlite3 reference-library/index.sqlite

# Show all indexed images
SELECT original_filename, description FROM reference_images;

# Show images with their keywords
SELECT original_filename, keywords_json FROM reference_images;

# Count indexed images
SELECT COUNT(*) FROM reference_images;
```

## API Cost Considerations

- Each new image requires **1 Gemini API call** (~$0.00125 per image with gemini-2.0-flash)
- Images already indexed are **skipped** (no API call)
- Use `--limit N` to control costs when testing
- The system deduplicates by SHA256 hash (same image = indexed once)

## Best Practices

1. **Start small**: Test with `--limit 5` first
2. **Batch imports**: Add all new images, then run the script once
3. **Regular maintenance**: Run after importing new reference images
4. **Backup database**: Keep a copy of `index.sqlite` before `--force` re-indexing
5. **Check quality**: Review the first few renamed files to ensure keywords are good

## What's Next?

After indexing, these images can be used:
- As reference images in `/api/postty-architect`
- For style profile extraction in `/api/style-profile`
- For semantic search (future feature)
- To train custom models (future feature)

The keywords and descriptions help the system understand image content and match them to user requests!

---

**See also**: `scripts/README.md` for more technical details.

