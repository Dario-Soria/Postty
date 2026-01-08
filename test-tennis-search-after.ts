import Database from 'better-sqlite3';
import path from 'path';

interface ReferenceImage {
  rowid: number;
  stored_path: string;
  tags: string;
  industry: string;
  aesthetic: string;
  mood: string;
  ranking: number;
}

const db = new Database('reference-library/index.sqlite');

console.log('='.repeat(80));
console.log('TESTING IMPROVED TENNIS SEARCH');
console.log('='.repeat(80));
console.log('\nSearch Query: "elegant woman playing tennis wearing denim shorts fashion photography, dynamic pose tennis court"\n');

const searchQuery = "elegant woman playing tennis wearing denim shorts fashion photography, dynamic pose tennis court";
const searchTerms = searchQuery
  .toLowerCase()
  .split(/\s+/)
  .filter(term => term.length > 2)
  .map(term => term.replace(/[^a-z0-9]/g, ''));

// Get all images
const allImages = db.prepare('SELECT rowid, * FROM reference_images').all() as ReferenceImage[];

// Score each image
const scored = allImages.map(row => {
  const tags = row.tags.split(',').map(t => t.trim());
  let score = 0;
  const matches: string[] = [];
  
  for (const term of searchTerms) {
    const tagMatch = tags.filter(tag => 
      tag.toLowerCase().includes(term) || term.includes(tag.toLowerCase())
    );
    if (tagMatch.length > 0) {
      score += tagMatch.length * 10;
      matches.push(`${term} → ${tagMatch.join(', ')}`);
    }
    
    if ((row.industry || '').toLowerCase().includes(term)) {
      score += 8;
      matches.push(`${term} → industry`);
    }
    if ((row.aesthetic || '').toLowerCase().includes(term)) {
      score += 6;
    }
    if ((row.mood || '').toLowerCase().includes(term)) {
      score += 5;
    }
  }
  
  return { row, score, matches };
}).sort((a, b) => {
  if (b.score !== a.score) return b.score - a.score;
  return (b.row.ranking || 1) - (a.row.ranking || 1);
});

console.log('TOP 3 RESULTS:\n');

scored.slice(0, 3).forEach(({ row, score, matches }, index) => {
  const filename = path.basename(row.stored_path);
  const isTennis = filename.includes('bba50');
  const marker = isTennis ? '🎾' : '  ';
  
  console.log(`${marker} #${index + 1}: ${filename}`);
  console.log(`    Score: ${score} (Ranking: ${row.ranking})`);
  console.log(`    Industry: ${row.industry} | Aesthetic: ${row.aesthetic}`);
  
  if (isTennis) {
    console.log('    ✅ THIS IS THE TENNIS PLAYING WOMAN IMAGE!');
    console.log(`    Tags: ${row.tags}`);
    console.log(`\n    Matched terms (${matches.length}):`);
    matches.slice(0, 10).forEach(m => console.log(`      ✓ ${m}`));
  } else {
    console.log(`    Tags preview: ${row.tags.split(',').slice(0, 8).join(', ')}...`);
  }
  console.log('');
});

// Find the tennis image specifically
const tennisImage = allImages.find(img => img.stored_path.includes('bba50'));
const tennisResult = scored.find(s => s.row.stored_path.includes('bba50'));

console.log('='.repeat(80));
console.log('IMPROVEMENT COMPARISON');
console.log('='.repeat(80));
console.log('\nTennis Image (bba50f346d896c926edbf0d75709d70b.jpg):');
console.log('  BEFORE:');
console.log('    Tags: exercising, running, tennis racket, athletic, fitness');
console.log('    Score: 20');
console.log('    Rank: Not in top 3 (below threshold)');
console.log('\n  AFTER:');
console.log(`    Tags: ${tennisImage?.tags}`);
console.log(`    Score: ${tennisResult?.score}`);
console.log(`    Rank: #${scored.findIndex(s => s.row.stored_path.includes('bba50')) + 1}`);
console.log(`    Status: ${tennisResult && scored.indexOf(tennisResult) < 3 ? '✅ NOW IN TOP 3!' : '❌ Still not in top 3'}`);
console.log('='.repeat(80));

