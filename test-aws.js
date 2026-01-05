#!/usr/bin/env node

// Load environment variables
require('dotenv/config');

const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');

console.log('\n🔍 Testing AWS S3 Configuration...\n');

// Check environment variables
console.log('Environment Variables:');
console.log('  AWS_ACCESS_KEY_ID:', process.env.AWS_ACCESS_KEY_ID ? 'SET ✅' : 'NOT SET ❌');
console.log('  AWS_SECRET_ACCESS_KEY:', process.env.AWS_SECRET_ACCESS_KEY ? 'SET ✅' : 'NOT SET ❌');
console.log('  AWS_BUCKET_NAME:', process.env.AWS_BUCKET_NAME ? `SET ✅ (${process.env.AWS_BUCKET_NAME})` : 'NOT SET ❌');
console.log('  AWS_REGION:', process.env.AWS_REGION || 'us-east-1', '✅');
console.log('');

if (!process.env.AWS_BUCKET_NAME) {
  console.error('❌ AWS_BUCKET_NAME is not set!');
  process.exit(1);
}

// Initialize S3
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'us-east-1',
});

const bucketName = process.env.AWS_BUCKET_NAME;

async function testS3() {
  try {
    // Test 1: List buckets
    console.log('Test 1: Checking AWS credentials and permissions...');
    const bucketsResult = await s3.listBuckets().promise();
    console.log('✅ AWS credentials are valid!');
    console.log(`   Found ${bucketsResult.Buckets.length} bucket(s)`);
    
    const targetBucket = bucketsResult.Buckets.find(b => b.Name === bucketName);
    if (targetBucket) {
      console.log(`✅ Target bucket "${bucketName}" exists!`);
    } else {
      console.log(`⚠️  Warning: Bucket "${bucketName}" not found in your account`);
      console.log('   Available buckets:', bucketsResult.Buckets.map(b => b.Name).join(', '));
    }
    console.log('');

    // Test 2: Create a test file
    console.log('Test 2: Creating test image file...');
    const testImagePath = path.join(__dirname, 'test-upload.txt');
    fs.writeFileSync(testImagePath, 'This is a test upload from Postty at ' + new Date().toISOString());
    console.log('✅ Test file created');
    console.log('');

    // Test 3: Upload to S3
    console.log('Test 3: Uploading to S3...');
    const fileContent = fs.readFileSync(testImagePath);
    const s3Key = `test-uploads/${Date.now()}-test.txt`;
    
    const uploadParams = {
      Bucket: bucketName,
      Key: s3Key,
      Body: fileContent,
      ContentType: 'text/plain',
    };

    const uploadResult = await s3.upload(uploadParams).promise();
    console.log('✅ Upload successful!');
    console.log('   S3 URL:', uploadResult.Location);
    console.log('');

    // Test 4: Verify the file exists
    console.log('Test 4: Verifying uploaded file...');
    const headResult = await s3.headObject({
      Bucket: bucketName,
      Key: s3Key,
    }).promise();
    console.log('✅ File verified in S3!');
    console.log('   Size:', headResult.ContentLength, 'bytes');
    console.log('   Content-Type:', headResult.ContentType);
    console.log('');

    // Test 5: Clean up test file from S3
    console.log('Test 5: Cleaning up test file from S3...');
    await s3.deleteObject({
      Bucket: bucketName,
      Key: s3Key,
    }).promise();
    console.log('✅ Test file deleted from S3');
    console.log('');

    // Clean up local test file
    fs.unlinkSync(testImagePath);

    console.log('═══════════════════════════════════════════');
    console.log('✅ ALL AWS S3 TESTS PASSED!');
    console.log('═══════════════════════════════════════════');
    console.log('Your AWS configuration is working correctly.');
    console.log('Instagram posting should work now! 🎉\n');

  } catch (error) {
    console.error('\n❌ AWS S3 Test Failed!');
    console.error('Error:', error.message);
    
    if (error.code === 'InvalidAccessKeyId') {
      console.error('\n💡 Solution: Check your AWS_ACCESS_KEY_ID');
    } else if (error.code === 'SignatureDoesNotMatch') {
      console.error('\n💡 Solution: Check your AWS_SECRET_ACCESS_KEY');
    } else if (error.code === 'NoSuchBucket') {
      console.error('\n💡 Solution: The bucket does not exist. Create it in AWS S3 console');
    } else if (error.code === 'AccessDenied' || error.code === 'AllAccessDisabled') {
      console.error('\n💡 Solution: Your IAM user needs s3:PutObject permission for this bucket');
    }
    
    console.error('\nFull error details:');
    console.error(error);
    process.exit(1);
  }
}

testS3();

