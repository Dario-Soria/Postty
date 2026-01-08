import Database from 'better-sqlite3';
import path from 'path';

interface ReferenceImage {
  original_filename: string;
  tags: string;
  industry: string;
  aesthetic: string;
  mood: string;
}

const db = new Database('reference-library/index.sqlite');
const images = db.prepare('SELECT original_filename, tags, industry, aesthetic, mood FROM reference_images ORDER BY original_filename').all() as ReferenceImage[];

console.log('='.repeat(80));
console.log('TAG QUALITY REPORT');
console.log('='.repeat(80));
console.log('\n');

let totalSpecificSports = 0;
let totalSpecificVehicles = 0;
let totalSpecificScenery = 0;
let totalSpecificActivities = 0;

images.forEach((img) => {
  const tags = img.tags.split(',').map((t: string) => t.trim().toLowerCase());
  
  // Check for specific sports
  const specificSports = tags.filter(t => 
    ['tennis', 'playing-tennis', 'golf', 'playing-golf', 'basketball', 'football', 'soccer', 
     'volleyball', 'swimming', 'surfing', 'skiing', 'snowboarding'].includes(t)
  );
  
  // Check for specific vehicles
  const specificVehicles = tags.filter(t => 
    ['sports-car', 'vintage-car', 'sedan', 'suv', 'convertible', 'motorcycle', 
     'motorbike', 'bicycle', 'bike', 'mountain-bike', 'road-bike'].includes(t)
  );
  
  // Check for specific scenery
  const specificScenery = tags.filter(t => 
    ['mountain', 'hillside', 'beach', 'seaside', 'oceanfront', 'lakeside', 'poolside',
     'tennis-court', 'basketball-court', 'sports-field', 'forest', 'woods', 
     'city', 'downtown', 'rooftop'].includes(t)
  );
  
  // Check for specific activities (instead of generic exercising/running)
  const specificActivities = tags.filter(t =>
    ['posing', 'modeling', 'walking', 'sitting', 'standing', 'jumping', 'dancing',
     'reading', 'relaxing', 'celebrating', 'shopping', 'traveling'].includes(t)
  );
  
  const hasSpecificSport = specificSports.length > 0;
  const hasSpecificVehicle = specificVehicles.length > 0;
  const hasSpecificScenery = specificScenery.length > 0;
  const hasSpecificActivity = specificActivities.length > 0;
  
  if (hasSpecificSport) totalSpecificSports++;
  if (hasSpecificVehicle) totalSpecificVehicles++;
  if (hasSpecificScenery) totalSpecificScenery++;
  if (hasSpecificActivity) totalSpecificActivities++;
  
  console.log(`${img.original_filename}:`);
  console.log(`  Total tags: ${tags.length}`);
  console.log(`  Industry: ${img.industry} | Aesthetic: ${img.aesthetic} | Mood: ${img.mood}`);
  
  if (hasSpecificSport) {
    console.log(`  ✓ Specific sports: ${specificSports.join(', ')}`);
  }
  if (hasSpecificVehicle) {
    console.log(`  ✓ Specific vehicles: ${specificVehicles.join(', ')}`);
  }
  if (hasSpecificScenery) {
    console.log(`  ✓ Specific scenery: ${specificScenery.join(', ')}`);
  }
  if (hasSpecificActivity) {
    console.log(`  ✓ Specific activities: ${specificActivities.join(', ')}`);
  }
  
  // Show first 10 tags as preview
  console.log(`  Tags preview: ${tags.slice(0, 10).join(', ')}...`);
  console.log('');
});

console.log('='.repeat(80));
console.log('SUMMARY');
console.log('='.repeat(80));
console.log(`Total images: ${images.length}`);
console.log(`Images with specific sports: ${totalSpecificSports} (${Math.round(totalSpecificSports/images.length*100)}%)`);
console.log(`Images with specific vehicles: ${totalSpecificVehicles} (${Math.round(totalSpecificVehicles/images.length*100)}%)`);
console.log(`Images with specific scenery: ${totalSpecificScenery} (${Math.round(totalSpecificScenery/images.length*100)}%)`);
console.log(`Images with specific activities: ${totalSpecificActivities} (${Math.round(totalSpecificActivities/images.length*100)}%)`);
console.log('='.repeat(80));

