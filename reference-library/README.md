# Reference Library

This folder contains reference images and their metadata for use in image generation.

## Structure

```
reference-library/
├── index.sqlite          # SQLite database with image metadata and keywords
├── images/               # Reference images (with optional paired JSON files)
│   ├── image1.jpg
│   ├── image1.json       # Optional: Text/metadata for image1.jpg
│   ├── image2.png
│   └── image2.json       # Optional: Text/metadata for image2.png
└── README.md            # This file
```

## Image-JSON Pairing

Each image can have an **optional** paired JSON file with the same filename:

```
455b905fb56f6bc30c66ab085a0e2f30.jpg  ← Image file
455b905fb56f6bc30c66ab085a0e2f30.json ← Metadata file (optional)
```

### JSON Metadata Format

The JSON file can contain information about text overlays, design elements, or any other metadata:

```json
{
  "text": "Sample promotional text",
  "headline": "BIG SALE",
  "subheadline": "50% OFF",
  "colors": ["#FF0000", "#FFFFFF"],
  "fonts": ["Bebas Neue", "Montserrat"],
  "layout": "centered",
  "notes": "Black Friday campaign design"
}
```

**Note**: The JSON format is flexible - you can store any metadata that's useful for your workflow.

## Database (index.sqlite)

The SQLite database stores:
- Image metadata (dimensions, file size, SHA256 hash)
- AI-extracted keywords and descriptions
- File paths
- Creation timestamps

This allows you to:
- Search images by keywords
- Deduplicate images
- Track when images were added
- Query images programmatically

## Indexing Images

### Automatic Indexing

When you upload reference images via the API (`/api/style-profile` or `/api/postty-architect`), they are automatically indexed in the background.

### Manual Batch Indexing

For images you manually add to the `images/` folder:

```bash
# Index all new images
npm run index-references

# Force re-index all images
npm run index-references -- --force

# Test with just 5 images
npm run index-references -- --limit 5
```

See [REFERENCE_LIBRARY_INDEXING.md](../REFERENCE_LIBRARY_INDEXING.md) for detailed documentation.

## Important: Filename Preservation

**Files are NEVER renamed** during indexing. This is critical because:

1. **JSON Pairing**: Renaming would break the connection between `image.jpg` and `image.json`
2. **External References**: Other systems may reference these files by name
3. **Organization**: You maintain control over your file naming scheme

Keywords and metadata are stored in the database, not in filenames.

## Querying the Database

You can query the database directly using SQLite:

```bash
sqlite3 reference-library/index.sqlite
```

### Example Queries

```sql
-- Show all indexed images
SELECT original_filename, description FROM reference_images;

-- Find images with specific keywords
SELECT original_filename, keywords_json 
FROM reference_images 
WHERE keywords_json LIKE '%black%friday%';

-- Count indexed images
SELECT COUNT(*) FROM reference_images;

-- Show recent additions
SELECT original_filename, created_at 
FROM reference_images 
ORDER BY created_at DESC 
LIMIT 10;

-- Find images without keywords (need re-indexing)
SELECT original_filename 
FROM reference_images 
WHERE keywords_json = '[]' OR description = '';
```

## Best Practices

1. **Consistent Naming**: Use descriptive filenames for your images
2. **JSON Metadata**: Add JSON files for images with text overlays or special metadata
3. **Regular Indexing**: Run `npm run index-references` after adding new images
4. **Backup**: Keep backups of both `images/` and `index.sqlite`
5. **Deduplication**: The system automatically deduplicates by SHA256 hash

## File Organization Tips

### By Campaign
```
images/
├── black-friday-2024-banner.jpg
├── black-friday-2024-banner.json
├── christmas-promo-square.png
└── christmas-promo-square.json
```

### By Style
```
images/
├── minimalist-product-01.jpg
├── minimalist-product-01.json
├── vibrant-sale-banner.jpg
└── vibrant-sale-banner.json
```

### By Hash (for programmatic use)
```
images/
├── 455b905fb56f6bc30c66ab085a0e2f30.jpg
├── 455b905fb56f6bc30c66ab085a0e2f30.json
├── ae12f96bf9839753ba7e37ee87fc3438.jpg
└── ae12f96bf9839753ba7e37ee87fc3438.json
```

Choose the organization that works best for your workflow!

## Troubleshooting

### Images not being indexed

1. Check that `GEMINI_API_KEY` is set in your `.env` file
2. Verify files are valid images (`.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`)
3. Check file permissions
4. Run with `--limit 1` to test a single image

### JSON files not being recognized

JSON files are optional and don't need to be "recognized" by the indexing system. They're simply paired with images by filename for your own use. The indexing system focuses on the image files themselves.

### Want to re-index with better keywords

```bash
npm run index-references -- --force
```

This will re-analyze all images with the current Gemini model.

---

For more information, see:
- [REFERENCE_LIBRARY_INDEXING.md](../REFERENCE_LIBRARY_INDEXING.md) - User guide
- [scripts/README.md](../scripts/README.md) - Technical documentation

