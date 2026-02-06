#!/usr/bin/env python3
"""
Script to download all free SVG icons from Untitled UI
"""
import os
import re
import time
import urllib.request
import ssl

# Target directory
ICONS_DIR = "/Users/juanmartinbeinesfurcada/Desktop/Code/Postty/New resources for new frontend/icons"

# Base URL for the icons page
BASE_URL = "https://www.untitledui.com/free-icons"

# SSL context to avoid certificate issues
ssl_context = ssl.create_default_context()
ssl_context.check_hostname = False
ssl_context.verify_mode = ssl.CERT_NONE

def get_page(url):
    """Fetch a page and return its content"""
    try:
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        })
        with urllib.request.urlopen(req, timeout=30, context=ssl_context) as response:
            return response.read().decode('utf-8')
    except Exception as e:
        print(f"Error fetching {url}: {e}")
        return None

def extract_svg_urls(html_content):
    """Extract SVG URLs from HTML content"""
    # Pattern to match SVG URLs from the CDN
    pattern = r'https://cdn\.prod\.website-files\.com/[a-f0-9]+/[a-f0-9_]+\.svg'
    urls = re.findall(pattern, html_content)
    return list(set(urls))  # Remove duplicates

def download_svg(url, output_path):
    """Download an SVG file"""
    try:
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        })
        with urllib.request.urlopen(req, timeout=30, context=ssl_context) as response:
            content = response.read()
            with open(output_path, 'wb') as f:
                f.write(content)
            return True
    except Exception as e:
        print(f"Error downloading {url}: {e}")
        return False

def get_icon_name_from_url(url):
    """Extract icon name from URL"""
    # URLs look like: .../6642365c88eeb080005b0f05_65bf4db667c2d3e36417868c_activity.svg
    filename = url.split('/')[-1]
    # Extract the name part after the last underscore
    match = re.search(r'_([a-z0-9-]+)\.svg$', filename, re.IGNORECASE)
    if match:
        return match.group(1) + '.svg'
    return filename

def main():
    # Create output directory if it doesn't exist
    os.makedirs(ICONS_DIR, exist_ok=True)
    
    all_svg_urls = set()
    
    # Fetch all 17 pages
    print("Fetching icon pages...")
    for page in range(1, 18):
        if page == 1:
            url = BASE_URL
        else:
            url = f"{BASE_URL}?25cd15aa_page={page}"
        
        print(f"  Page {page}/17: {url}")
        html = get_page(url)
        if html:
            urls = extract_svg_urls(html)
            print(f"    Found {len(urls)} SVG URLs")
            all_svg_urls.update(urls)
        time.sleep(0.5)  # Be nice to the server
    
    # Filter to only include icon SVGs (not UI elements)
    icon_urls = [url for url in all_svg_urls if '_' in url.split('/')[-1]]
    
    print(f"\nTotal unique SVG URLs found: {len(icon_urls)}")
    
    # Download all SVGs
    print("\nDownloading SVGs...")
    success_count = 0
    skip_count = 0
    fail_count = 0
    
    for i, url in enumerate(sorted(icon_urls)):
        icon_name = get_icon_name_from_url(url)
        output_path = os.path.join(ICONS_DIR, icon_name)
        
        if os.path.exists(output_path):
            skip_count += 1
            continue
        
        if download_svg(url, output_path):
            success_count += 1
        else:
            fail_count += 1
        
        if (i + 1) % 50 == 0:
            print(f"  Progress: {i+1}/{len(icon_urls)} (downloaded: {success_count}, skipped: {skip_count}, failed: {fail_count})")
        
        time.sleep(0.1)  # Small delay between downloads
    
    print(f"\n=== Download Complete ===")
    print(f"Downloaded: {success_count}")
    print(f"Skipped (already exist): {skip_count}")
    print(f"Failed: {fail_count}")
    
    # Count total SVGs in folder
    svg_count = len([f for f in os.listdir(ICONS_DIR) if f.endswith('.svg')])
    print(f"Total SVGs in folder: {svg_count}")

if __name__ == "__main__":
    main()
