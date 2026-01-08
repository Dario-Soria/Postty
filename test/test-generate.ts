/**
 * Standalone Nano Banana Test Script
 * 
 * This script EXACTLY replicates the Gemini API call from production
 * Uses the same library, same configuration, same prompt building logic
 * 
 * Usage:
 *   npx ts-node test/test-generate.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import dotenv from 'dotenv';

// Load environment variables from .env
dotenv.config();

// Configuration - EXACTLY as production
const TEST_DIR = path.join(process.cwd(), 'test');
const RESULTS_DIR = path.join(TEST_DIR, 'results');
const REFERENCE_PATH = path.join(TEST_DIR, 'reference.jpg');
const PROMPT_PATH = path.join(TEST_DIR, 'prompt.md');
const API_KEY = process.env.GEMINI_API_KEY;
const NANO_BANANA_MODEL = 'gemini-2.5-flash-image';

console.log('='.repeat(80));
console.log('🧪 NANO BANANA ISOLATED TEST - EXACT PRODUCTION REPLICATION');
console.log('='.repeat(80));
console.log();

// Validate API key
if (!API_KEY) {
  console.error('❌ ERROR: GEMINI_API_KEY environment variable not set');
  console.error('Please check your .env file');
  process.exit(1);
}

// TypeScript type assertion - we know API_KEY is defined after the check above
const VERIFIED_API_KEY: string = API_KEY;

// Find product image
function findProductImage(): string | null {
  const extensions = ['.webp', '.jpg', '.jpeg', '.png'];
  for (const ext of extensions) {
    const productPath = path.join(TEST_DIR, `product${ext}`);
    if (fs.existsSync(productPath)) {
      return productPath;
    }
  }
  return null;
}

// Convert image to base64 - EXACTLY as production
function imageToBase64(filePath: string): string {
  const buffer = fs.readFileSync(filePath);
  return buffer.toString('base64');
}

// Guess MIME type - EXACTLY as production
function guessMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes: { [key: string]: string } = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
  };
  return mimeTypes[ext] || 'image/jpeg';
}

// Main function
async function runTest() {
  try {
    // 1. Check all required files
    console.log('📋 Checking files...');
    
    if (!fs.existsSync(REFERENCE_PATH)) {
      console.error(`❌ Reference image not found: ${REFERENCE_PATH}`);
      process.exit(1);
    }
    console.log(`✅ Reference image: ${path.basename(REFERENCE_PATH)}`);
    
    const productPath = findProductImage();
    if (!productPath) {
      console.error('❌ Product image not found!');
      console.error('Expected: product.webp, product.jpg, or product.png');
      process.exit(1);
    }
    console.log(`✅ Product image: ${path.basename(productPath)}`);
    
    if (!fs.existsSync(PROMPT_PATH)) {
      console.error(`❌ Prompt file not found: ${PROMPT_PATH}`);
      process.exit(1);
    }
    console.log(`✅ Prompt file: ${path.basename(PROMPT_PATH)}`);
    console.log();
    
    // 2. Load prompt
    console.log('📝 Loading prompt...');
    const prompt = fs.readFileSync(PROMPT_PATH, 'utf-8');
    console.log(`   Length: ${prompt.length} characters`);
    console.log();
    
    // 3. Convert images to base64 - EXACTLY as production
    console.log('🖼️  Preparing images...');
    const referenceBase64 = imageToBase64(REFERENCE_PATH);
    const productBase64 = imageToBase64(productPath);
    const referenceMime = guessMimeType(REFERENCE_PATH);
    const productMime = guessMimeType(productPath);
    console.log(`   Reference: ${(referenceBase64.length / 1024).toFixed(1)} KB (${referenceMime})`);
    console.log(`   Product: ${(productBase64.length / 1024).toFixed(1)} KB (${productMime})`);
    console.log();
    
    // 4. Build parts array - EXACTLY as production (nanoBananaGenerator.ts line 392-406)
    console.log('🔧 Building API request...');
    const parts = [
      { text: prompt },
      { 
        inlineData: { 
          mimeType: referenceMime, 
          data: referenceBase64 
        } 
      },
      { 
        inlineData: { 
          mimeType: productMime, 
          data: productBase64 
        } 
      },
    ];
    
    // 5. Initialize Gemini AI - EXACTLY as production (nanoBananaGenerator.ts line 409-422)
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    
    const genAI = new GoogleGenerativeAI(VERIFIED_API_KEY);
    const model = genAI.getGenerativeModel({
      model: NANO_BANANA_MODEL,
      generationConfig: {
        temperature: 0.4,  // EXACT production value
        topP: 0.95,        // EXACT production value
        topK: 40,          // EXACT production value
        // @ts-ignore - responseModalities is required for image generation
        responseModalities: ['image', 'text'],  // CRITICAL for image output
      },
    });
    
    console.log(`   Model: ${NANO_BANANA_MODEL}`);
    console.log(`   Temperature: 0.4`);
    console.log(`   Response modalities: image, text`);
    console.log(`   Parts: 1 text prompt + 2 images`);
    console.log();
    
    // 6. Send request - EXACTLY as production (nanoBananaGenerator.ts line 424-434)
    console.log('📤 Sending request to Gemini API...');
    console.log('   (This may take 10-20 seconds...)');
    const startTime = Date.now();
    
    const result = await model.generateContent({
      contents: [{ role: 'user', parts }],
    });
    
    const response = await result.response;
    const duration = Date.now() - startTime;
    
    console.log(`✅ Response received in ${duration}ms (${(duration / 1000).toFixed(1)}s)`);
    console.log();
    
    // 7. Check for safety blocks - EXACTLY as production
    console.log('🔍 Checking response...');
    if (response.candidates?.[0]?.finishReason) {
      const finishReason = response.candidates[0].finishReason;
      console.log(`   Finish reason: ${finishReason}`);
      
      if (finishReason === 'SAFETY') {
        console.error('❌ Generation blocked by safety filters!');
        console.error('Safety ratings:', JSON.stringify(response.candidates[0].safetyRatings, null, 2));
        process.exit(1);
      }
      
      if (finishReason !== 'STOP') {
        console.warn(`⚠️  Unusual finish reason: ${finishReason}`);
      }
    }
    
    // 8. Extract image - EXACTLY as production (nanoBananaGenerator.ts line 313-347)
    console.log('🖼️  Extracting image...');
    
    let imageBase64: string | null = null;
    
    // Strategy 1: candidates[0].content.parts[].inlineData.data
    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData?.data) {
          imageBase64 = part.inlineData.data;
          console.log('   ✅ Found image in candidates[0].content.parts[].inlineData.data');
          break;
        }
      }
    }
    
    if (!imageBase64) {
      console.error('❌ No image data found in response!');
      console.error('Response structure:', JSON.stringify({
        candidates: response.candidates?.length,
        finishReason: response.candidates?.[0]?.finishReason,
        parts: response.candidates?.[0]?.content?.parts?.length,
      }, null, 2));
      process.exit(1);
    }
    
    const imageBuffer = Buffer.from(imageBase64, 'base64');
    console.log(`   Image size: ${(imageBuffer.length / 1024).toFixed(1)} KB`);
    
    // 9. Get dimensions
    const metadata = await sharp(imageBuffer).metadata();
    console.log(`   Dimensions: ${metadata.width}x${metadata.height}`);
    console.log();
    
    // 10. Save result
    const timestamp = Date.now();
    const outputPath = path.join(RESULTS_DIR, `test_${timestamp}.png`);
    fs.writeFileSync(outputPath, imageBuffer);
    
    console.log('='.repeat(80));
    console.log('✅ TEST COMPLETE - EXACT PRODUCTION REPLICATION');
    console.log('='.repeat(80));
    console.log();
    console.log(`📁 Output: ${outputPath}`);
    console.log(`⏱️  Generation: ${(duration / 1000).toFixed(1)}s`);
    console.log(`📐 Size: ${metadata.width}x${metadata.height}`);
    console.log();
    console.log('💡 Next steps:');
    console.log('   1. Compare with original: generated-images/1767876654154_nanobanana_base.png');
    console.log('   2. Edit test/prompt.md to iterate');
    console.log('   3. Run again: npx ts-node test/test-generate.ts');
    console.log();
    
  } catch (error: any) {
    console.error();
    console.error('='.repeat(80));
    console.error('❌ ERROR DURING GENERATION');
    console.error('='.repeat(80));
    console.error();
    console.error('Message:', error.message);
    
    if (error.response?.data) {
      console.error('API Response:', JSON.stringify(error.response.data, null, 2));
    }
    
    console.error();
    console.error('Stack trace:');
    console.error(error.stack);
    
    process.exit(1);
  }
}

// Run the test
runTest();
