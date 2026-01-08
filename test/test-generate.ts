/**
 * Standalone Nano Banana Test Script
 * 
 * This script supports TWO modes:
 * 1. CURRENT MODE: Uses hardcoded prompt from prompt.md (production method)
 * 2. AGENT MODE: Uses agent-generated prompt from prompt-template-section.md
 * 
 * Both modes use EXACTLY the same Gemini API call - only the prompt source differs
 * 
 * Usage:
 *   npx ts-node test/test-generate.ts              # defaults to current mode
 *   npx ts-node test/test-generate.ts --mode=current
 *   npx ts-node test/test-generate.ts --mode=agent
 */

import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import dotenv from 'dotenv';
import { AgentPromptBuilder } from './agent-prompt-builder';

// Load environment variables from .env
dotenv.config();

// Parse command line arguments
const args = process.argv.slice(2);
const modeArg = args.find(arg => arg.startsWith('--mode='));
const MODE = modeArg ? modeArg.split('=')[1] : 'current';

if (!['current', 'agent'].includes(MODE)) {
  console.error('❌ Invalid mode. Use --mode=current or --mode=agent');
  process.exit(1);
}

// Configuration - EXACTLY as production
const TEST_DIR = path.join(process.cwd(), 'test');
const RESULTS_DIR = path.join(TEST_DIR, 'results');
const REFERENCE_PATH = path.join(TEST_DIR, 'reference.jpg');
const PROMPT_PATH = path.join(TEST_DIR, 'prompt.md');
const API_KEY = process.env.GEMINI_API_KEY;
const NANO_BANANA_MODEL = 'gemini-2.5-flash-image';

console.log('='.repeat(80));
console.log('🧪 NANO BANANA ISOLATED TEST');
console.log('='.repeat(80));
console.log();
console.log(`📋 MODE: ${MODE.toUpperCase()}`);
if (MODE === 'current') {
  console.log('   Using hardcoded prompt from prompt.md (production method)');
} else {
  console.log('   Using agent-generated prompt from prompt-template-section.md');
}
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
    
    // 2. Load prompt (different based on mode)
    console.log('📝 Loading prompt...');
    let prompt: string;
    
    if (MODE === 'current') {
      // Current mode: Use hardcoded prompt from prompt.md
      prompt = fs.readFileSync(PROMPT_PATH, 'utf-8');
      console.log(`   Source: ${path.basename(PROMPT_PATH)} (hardcoded)`);
      console.log(`   Length: ${prompt.length} characters`);
    } else {
      // Agent mode: Generate prompt using template
      console.log('   Source: agent-prompt-builder.ts (dynamic generation)');
      const builder = new AgentPromptBuilder();
      
      // These parameters would normally come from the agent's analysis
      // For this test, we use the same values as the current prompt
      prompt = builder.buildCompletePrompt({
        userDescription: "Professional fashion photography. A sophisticated woman wearing black leather knee-high boots with buckles (the hero product) from the user's uploaded image, sitting gracefully on a pristine green tennis court, reading a newspaper. The composition is calm and luxurious. Full-length view of the woman, with the boots clearly visible and extending to the ground.",
        framingType: "Full-length shot",
        outfitDescription: "white elegant dress",
        productDescription: "black leather knee-high boots with buckles",
        locationDescription: "pristine green tennis court",
        moodDescription: "elegant, serene ambiance, in line with a luxurious and calm mood",
        lightingDescription: "Soft, warm natural lighting",
        depthDescription: "Shallow depth of field",
        sceneType: "Clean product photography with minimal background",
        textElements: [
          {
            text: 'Botas "el Uli',
            typography: 'serif elegant (thin strokes, flowing style)',
            weight: 'regular',
            case: 'title-case',
            color: 'black',
            position: '40%',
            size: 'large',
            alignment: 'center',
            letterSpacing: 'normal',
          },
          {
            text: '50% off en toda la tienda',
            typography: 'script elegant',
            weight: 'regular',
            color: 'black',
            position: '45%',
            size: 'medium',
            alignment: 'center',
            letterSpacing: 'normal',
            spacing: 'tight (5-10%)',
          },
        ],
        productColors: ['#F6F4EF', '#2E2F31', '#B2B1AE'],
        aspectRatio: '1:1',
      });
      console.log(`   Length: ${prompt.length} characters`);
      console.log('   Template: prompt-template-section.md');
    }
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
    const modePrefix = MODE === 'agent' ? 'agent' : 'current';
    const outputPath = path.join(RESULTS_DIR, `${modePrefix}_${timestamp}.png`);
    fs.writeFileSync(outputPath, imageBuffer);
    
    console.log('='.repeat(80));
    console.log(`✅ TEST COMPLETE - ${MODE.toUpperCase()} MODE`);
    console.log('='.repeat(80));
    console.log();
    console.log(`📁 Output: ${outputPath}`);
    console.log(`⏱️  Generation: ${(duration / 1000).toFixed(1)}s`);
    console.log(`📐 Size: ${metadata.width}x${metadata.height}`);
    console.log(`🎯 Mode: ${MODE}`);
    console.log();
    console.log('💡 Next steps:');
    if (MODE === 'current') {
      console.log('   1. Edit test/prompt.md to iterate');
      console.log('   2. Run again: npx ts-node test/test-generate.ts --mode=current');
      console.log('   3. Try agent mode: npx ts-node test/test-generate.ts --mode=agent');
    } else {
      console.log('   1. Edit test/prompt-template-section.md to iterate');
      console.log('   2. Run again: npx ts-node test/test-generate.ts --mode=agent');
      console.log('   3. Compare with current mode: npx ts-node test/test-generate.ts --mode=current');
      console.log('   4. Use test/compare-prompts.ts to see differences');
    }
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
