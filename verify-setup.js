#!/usr/bin/env node
/**
 * Setup Verification Script
 * Run this before your first post to verify all credentials are configured
 */

require('dotenv').config();

const checks = [
  {
    name: 'Instagram User ID',
    key: 'INSTAGRAM_USER_ID',
    required: true,
  },
  {
    name: 'Instagram Access Token',
    key: 'INSTAGRAM_ACCESS_TOKEN',
    required: true,
  },
  {
    name: 'AWS Access Key ID',
    key: 'AWS_ACCESS_KEY_ID',
    required: true,
  },
  {
    name: 'AWS Secret Access Key',
    key: 'AWS_SECRET_ACCESS_KEY',
    required: true,
  },
  {
    name: 'AWS Region',
    key: 'AWS_REGION',
    required: true,
  },
  {
    name: 'AWS Bucket Name',
    key: 'AWS_BUCKET_NAME',
    required: true,
  },
  {
    name: 'Port',
    key: 'PORT',
    required: false,
    default: '8080',
  },
  {
    name: 'Graph API Version',
    key: 'GRAPH_API_VERSION',
    required: false,
    default: 'v19.0',
  },
];

console.log('🔍 Verifying Instagram Poster Setup...\n');

let missingRequired = 0;
let warnings = 0;

checks.forEach((check) => {
  const value = process.env[check.key];
  const hasValue = value && value.trim() !== '';

  if (check.required && !hasValue) {
    console.log(`❌ ${check.name} (${check.key}): MISSING (REQUIRED)`);
    missingRequired++;
  } else if (!check.required && !hasValue) {
    console.log(
      `⚠️  ${check.name} (${check.key}): Not set (will use default: ${check.default})`
    );
    warnings++;
  } else {
    const displayValue =
      check.key.includes('SECRET') || check.key.includes('TOKEN')
        ? `${value.substring(0, 10)}...`
        : value;
    console.log(`✅ ${check.name} (${check.key}): ${displayValue}`);
  }
});

console.log('\n' + '='.repeat(60));

if (missingRequired > 0) {
  console.log(
    `\n❌ Setup INCOMPLETE: ${missingRequired} required variable(s) missing`
  );
  console.log('\nAdd missing variables to your .env file and try again.');
  console.log('See QUICKSTART.md for detailed setup instructions.');
  process.exit(1);
} else if (warnings > 0) {
  console.log(
    `\n⚠️  Setup OK but ${warnings} optional variable(s) not set (using defaults)`
  );
  console.log('✅ All required variables configured!');
  console.log('\n🚀 You can now start the server with: npm run dev');
  process.exit(0);
} else {
  console.log('\n✅ Setup COMPLETE! All variables configured.');
  console.log('\n🚀 You can now start the server with: npm run dev');
  process.exit(0);
}

