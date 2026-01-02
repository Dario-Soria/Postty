#!/usr/bin/env python3
"""
Test script to verify URL extraction functionality.
This tests the _extract_image_url function without needing Gemini API calls.
"""

import re
import sys
from typing import Optional


def _extract_image_url(message: str) -> tuple[str, Optional[str]]:
    """
    Extract image URL or file path from message text.
    Returns (clean_text, image_source) where image_source can be a URL or file path.
    """
    # Pattern to match HTTP/HTTPS URLs
    url_pattern = r'https?://[^\s]+'
    
    # Find all URLs in the message
    urls = re.findall(url_pattern, message)
    
    if urls:
        # Use the first URL found
        image_source = urls[0]
        # Remove the URL from the message to get clean text
        clean_text = re.sub(re.escape(image_source), '', message).strip()
    else:
        # Look for file paths (common patterns)
        # Matches: /path/to/file.jpg, ./file.png, ~/file.jpg, file.jpeg, etc.
        file_pattern = r'(?:\.{0,2}/)?(?:[\w\-~/]+/)*[\w\-]+\.(?:jpg|jpeg|png|gif|webp|bmp)'
        files = re.findall(file_pattern, message, re.IGNORECASE)
        
        if files:
            image_source = files[0]
            # Remove the file path from the message
            clean_text = re.sub(re.escape(image_source), '', message).strip()
        else:
            return message, None
    
    # Clean up extra whitespace
    clean_text = ' '.join(clean_text.split())
    
    return clean_text, image_source


def test_url_extraction():
    """Test various URL extraction scenarios."""
    
    test_cases = [
        # (input, expected_text, expected_source)
        # URL tests
        (
            "I want to promote this product https://example.com/product.jpg",
            "I want to promote this product",
            "https://example.com/product.jpg"
        ),
        (
            "https://example.com/image.png Check out my cookies",
            "Check out my cookies",
            "https://example.com/image.png"
        ),
        (
            "Multiple URLs https://first.com/img.jpg and https://second.com/photo.png",
            "Multiple URLs and https://second.com/photo.png",
            "https://first.com/img.jpg"  # Should extract first one
        ),
        (
            "https://images.squarespace-cdn.com/content/v1/5df7e6411f5f855517acde6e/1585762000008-550T0X2AZ98QKYNETT21/IMG_8948.jpg",
            "",
            "https://images.squarespace-cdn.com/content/v1/5df7e6411f5f855517acde6e/1585762000008-550T0X2AZ98QKYNETT21/IMG_8948.jpg"
        ),
        (
            "Promote my product http://example.com/product.jpg with great lighting",
            "Promote my product with great lighting",
            "http://example.com/product.jpg"
        ),
        # File path tests
        (
            "Check out my product: ./myproduct.png",
            "Check out my product:",
            "./myproduct.png"
        ),
        (
            "Here's the image ~/Downloads/photo.jpg for reference",
            "Here's the image for reference",
            "~/Downloads/photo.jpg"
        ),
        (
            "Look at /Users/test/images/product.jpeg please",
            "Look at please",
            "/Users/test/images/product.jpeg"
        ),
        (
            "My file is image.jpg in current directory",
            "My file is in current directory",
            "image.jpg"
        ),
        (
            "No image or URL here just text",
            "No image or URL here just text",
            None
        ),
    ]
    
    print("=" * 70)
    print("URL Extraction Test Suite")
    print("=" * 70)
    print()
    
    passed = 0
    failed = 0
    
    for i, (input_text, expected_text, expected_url) in enumerate(test_cases, 1):
        print(f"Test {i}:")
        print(f"  Input: {input_text[:60]}...")
        
        result_text, result_url = _extract_image_url(input_text)
        
        text_match = result_text == expected_text
        url_match = result_url == expected_url
        
        if text_match and url_match:
            print(f"  ✅ PASS")
            passed += 1
        else:
            print(f"  ❌ FAIL")
            failed += 1
            if not text_match:
                print(f"     Expected text: '{expected_text}'")
                print(f"     Got text:      '{result_text}'")
            if not url_match:
                print(f"     Expected URL: {expected_url}")
                print(f"     Got URL:      {result_url}")
        print()
    
    print("=" * 70)
    print(f"Results: {passed} passed, {failed} failed out of {len(test_cases)} tests")
    print("=" * 70)
    
    return failed == 0


if __name__ == "__main__":
    success = test_url_extraction()
    sys.exit(0 if success else 1)

