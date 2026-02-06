#!/bin/bash

# Directory for icons
ICONS_DIR="/Users/juanmartinbeinesfurcada/Desktop/Code/Postty/New resources for new frontend/icons"
mkdir -p "$ICONS_DIR"

# Temporary file for all URLs
URLS_FILE="/tmp/all_icon_urls.txt"
> "$URLS_FILE"

echo "Fetching icon URLs from all pages..."

# Fetch pages 1-17 and extract SVG URLs
for page in $(seq 1 17); do
    if [ $page -eq 1 ]; then
        url="https://www.untitledui.com/free-icons"
    else
        url="https://www.untitledui.com/free-icons?25cd15aa_page=$page"
    fi
    echo "  Page $page/17..."
    curl -s "$url" | grep -o 'https://cdn\.prod\.website-files\.com/6365d860c7b7a7191055eb8a/[^"]*\.svg' >> "$URLS_FILE"
done

# Remove duplicates and sort
sort -u "$URLS_FILE" > "${URLS_FILE}.sorted"
mv "${URLS_FILE}.sorted" "$URLS_FILE"

TOTAL=$(wc -l < "$URLS_FILE")
echo ""
echo "Found $TOTAL unique icon URLs"
echo ""

# Download each icon
DOWNLOADED=0
SKIPPED=0
FAILED=0

while IFS= read -r url; do
    # Extract filename - get last part after underscore before .svg
    filename=$(echo "$url" | grep -o '[^_]*\.svg$')
    
    if [ -z "$filename" ]; then
        # Fallback to full filename
        filename=$(basename "$url")
    fi
    
    output_path="$ICONS_DIR/$filename"
    
    if [ -f "$output_path" ]; then
        ((SKIPPED++))
    else
        if curl -s -o "$output_path" "$url"; then
            ((DOWNLOADED++))
        else
            ((FAILED++))
        fi
    fi
    
    # Progress every 100 icons
    TOTAL_PROCESSED=$((DOWNLOADED + SKIPPED + FAILED))
    if [ $((TOTAL_PROCESSED % 100)) -eq 0 ]; then
        echo "Progress: $TOTAL_PROCESSED/$TOTAL (downloaded: $DOWNLOADED, skipped: $SKIPPED, failed: $FAILED)"
    fi
done < "$URLS_FILE"

echo ""
echo "=== Download Complete ==="
echo "Downloaded: $DOWNLOADED"
echo "Skipped (already exist): $SKIPPED"  
echo "Failed: $FAILED"
echo ""
echo "Total SVGs in folder: $(ls -1 "$ICONS_DIR"/*.svg 2>/dev/null | wc -l)"
