/**
 * Compare Prompts Tool
 * 
 * This script compares the two approaches to prompt generation:
 * 1. CURRENT: Hardcoded template in TypeScript (nanoBananaGenerator.ts)
 * 2. AGENT: Dynamic template from prompt.md (agent-prompt-builder.ts)
 * 
 * Usage:
 *   npx ts-node test/compare-prompts.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { AgentPromptBuilder } from './agent-prompt-builder';

// Load current prompt (hardcoded)
const currentPromptPath = path.join(process.cwd(), 'test', 'prompt.md');
const currentPrompt = fs.readFileSync(currentPromptPath, 'utf-8');

// Generate agent prompt (dynamic)
const builder = new AgentPromptBuilder();
const agentPrompt = builder.buildCompletePrompt({
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

console.log('='.repeat(80));
console.log('📊 PROMPT COMPARISON: CURRENT vs AGENT');
console.log('='.repeat(80));
console.log();

// === CURRENT APPROACH ===
console.log('🔵 CURRENT APPROACH (Hardcoded in TypeScript)');
console.log('='.repeat(80));
console.log();
console.log('📍 Location:');
console.log('   - src/services/nanoBananaGenerator.ts (lines 148-258)');
console.log('   - Template is hardcoded in TypeScript');
console.log();
console.log('🔧 To Modify:');
console.log('   1. Edit TypeScript code');
console.log('   2. Save file');
console.log('   3. TypeScript recompiles (if watching)');
console.log('   4. Restart server (if not watching)');
console.log('   5. Test changes');
console.log('   ⏱️  Estimated time: 5-10 minutes per iteration');
console.log();
console.log('👥 Who Can Modify:');
console.log('   - Developers only');
console.log('   - Requires TypeScript knowledge');
console.log('   - Need to understand code structure');
console.log();
console.log('📏 Prompt Stats:');
console.log(`   - Length: ${currentPrompt.length} characters`);
console.log(`   - Lines: ${currentPrompt.split('\n').length}`);
console.log();
console.log('📝 Prompt Preview (first 500 chars):');
console.log('-'.repeat(80));
console.log(currentPrompt.substring(0, 500) + '...');
console.log('-'.repeat(80));
console.log();
console.log();

// === AGENT APPROACH ===
console.log('🟢 AGENT APPROACH (Controlled by prompt.md)');
console.log('='.repeat(80));
console.log();
console.log('📍 Location:');
console.log('   - test/prompt-template-section.md');
console.log('   - Template is in markdown (human-readable)');
console.log('   - Code in test/agent-prompt-builder.ts just fills variables');
console.log();
console.log('🔧 To Modify:');
console.log('   1. Edit markdown file');
console.log('   2. Save file');
console.log('   3. Test changes immediately');
console.log('   ⏱️  Estimated time: 30 seconds per iteration');
console.log();
console.log('👥 Who Can Modify:');
console.log('   - Anyone (developers, designers, copywriters)');
console.log('   - No coding knowledge required');
console.log('   - Just edit markdown text');
console.log();
console.log('📏 Prompt Stats:');
console.log(`   - Length: ${agentPrompt.length} characters`);
console.log(`   - Lines: ${agentPrompt.split('\n').length}`);
console.log();
console.log('📝 Prompt Preview (first 500 chars):');
console.log('-'.repeat(80));
console.log(agentPrompt.substring(0, 500) + '...');
console.log('-'.repeat(80));
console.log();
console.log();

// === COMPARISON ===
console.log('📊 KEY DIFFERENCES');
console.log('='.repeat(80));
console.log();

const differences = [
  {
    aspect: 'Iteration Speed',
    current: '5-10 minutes',
    agent: '30 seconds',
    winner: 'agent',
  },
  {
    aspect: 'Who Can Edit',
    current: 'Developers only',
    agent: 'Anyone',
    winner: 'agent',
  },
  {
    aspect: 'File Type',
    current: 'TypeScript (.ts)',
    agent: 'Markdown (.md)',
    winner: 'agent',
  },
  {
    aspect: 'Server Restart',
    current: 'Required',
    agent: 'Not required',
    winner: 'agent',
  },
  {
    aspect: 'Learning Curve',
    current: 'High (TypeScript)',
    agent: 'Low (plain text)',
    winner: 'agent',
  },
  {
    aspect: 'Per-Agent Customization',
    current: 'Shared template',
    agent: 'Each agent has own template',
    winner: 'agent',
  },
];

differences.forEach(diff => {
  const emoji = diff.winner === 'agent' ? '🟢' : '🔵';
  console.log(`${emoji} ${diff.aspect}:`);
  console.log(`   Current: ${diff.current}`);
  console.log(`   Agent:   ${diff.agent}`);
  console.log();
});

// === SIMILARITY CHECK ===
console.log('🔍 PROMPT SIMILARITY');
console.log('='.repeat(80));
console.log();

// Calculate similarity (simple character diff)
const lengthDiff = Math.abs(currentPrompt.length - agentPrompt.length);
const lengthDiffPercent = ((lengthDiff / currentPrompt.length) * 100).toFixed(1);

console.log(`Length difference: ${lengthDiff} characters (${lengthDiffPercent}%)`);
console.log();

if (lengthDiffPercent < '10') {
  console.log('✅ Prompts are very similar in length');
  console.log('   Both approaches should produce comparable results');
} else {
  console.log('⚠️  Prompts have significant length difference');
  console.log('   Results may vary - compare outputs carefully');
}
console.log();

// === NEXT STEPS ===
console.log('🚀 NEXT STEPS');
console.log('='.repeat(80));
console.log();
console.log('1. Run both modes to generate test images:');
console.log('   npx ts-node test/test-generate.ts --mode=current');
console.log('   npx ts-node test/test-generate.ts --mode=agent');
console.log();
console.log('2. Compare the generated images in test/results/');
console.log('   - current_*.png (hardcoded approach)');
console.log('   - agent_*.png (prompt.md approach)');
console.log();
console.log('3. If agent approach produces good results:');
console.log('   - Edit test/prompt-template-section.md to improve');
console.log('   - Run again: npx ts-node test/test-generate.ts --mode=agent');
console.log('   - Iterate quickly until perfect');
console.log();
console.log('4. Once satisfied, implement in production:');
console.log('   - Add template section to Agents/Product Showcase/prompt.md');
console.log('   - Update production code to read from prompt.md');
console.log('   - Each of 4 agents gets its own template');
console.log();
console.log('='.repeat(80));
console.log('💡 Remember: The goal is prompt-driven development');
console.log('   Change prompts, not code!');
console.log('='.repeat(80));
console.log();

// Save comparison to file
const comparisonOutput = `# Prompt Comparison Report

Generated: ${new Date().toISOString()}

## Current Prompt (Hardcoded)

**Length:** ${currentPrompt.length} characters
**Location:** src/services/nanoBananaGenerator.ts

\`\`\`
${currentPrompt}
\`\`\`

## Agent Prompt (Dynamic)

**Length:** ${agentPrompt.length} characters
**Location:** test/prompt-template-section.md

\`\`\`
${agentPrompt}
\`\`\`

## Summary

- Length difference: ${lengthDiff} characters (${lengthDiffPercent}%)
- Iteration time: Current (5-10 min) vs Agent (30 sec)
- Editability: Current (developers only) vs Agent (anyone)
`;

const reportPath = path.join(process.cwd(), 'test', 'comparison-report.md');
fs.writeFileSync(reportPath, comparisonOutput);

console.log(`📄 Full comparison saved to: ${reportPath}`);
console.log();

