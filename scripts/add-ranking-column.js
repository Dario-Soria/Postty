/**
 * Migration script to add ranking column to reference_images table
 * Run with: node scripts/add-ranking-column.js
 */

const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.join(process.cwd(), 'reference-library', 'index.sqlite');

console.log('Opening database:', dbPath);
const db = new Database(dbPath);

try {
  // Check if ranking column exists
  const tableInfo = db.prepare("PRAGMA table_info(reference_images)").all();
  const hasRanking = tableInfo.some(col => col.name === 'ranking');
  
  if (hasRanking) {
    console.log('✅ Ranking column already exists!');
    
    // Make sure all values are set to 1
    const result = db.prepare('UPDATE reference_images SET ranking = 1 WHERE ranking IS NULL OR ranking < 1').run();
    console.log(`✅ Updated ${result.changes} rows to ranking = 1`);
  } else {
    console.log('Adding ranking column...');
    
    // Add the column
    db.exec('ALTER TABLE reference_images ADD COLUMN ranking INTEGER DEFAULT 1;');
    console.log('✅ Ranking column added!');
    
    // Set all existing records to 1
    const result = db.exec('UPDATE reference_images SET ranking = 1;');
    console.log('✅ All existing records set to ranking = 1');
    
    // Create index
    db.exec('CREATE INDEX IF NOT EXISTS idx_reference_images_ranking ON reference_images(ranking DESC);');
    console.log('✅ Index created!');
  }
  
  // Show some stats
  const stats = db.prepare('SELECT COUNT(*) as total, MIN(ranking) as min, MAX(ranking) as max FROM reference_images').get();
  console.log('\nDatabase stats:');
  console.log(`  Total images: ${stats.total}`);
  console.log(`  Ranking range: ${stats.min} - ${stats.max}`);
  
  console.log('\n✅ Migration completed successfully!');
} catch (error) {
  console.error('❌ Migration failed:', error.message);
  process.exit(1);
} finally {
  db.close();
}

