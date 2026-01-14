import * as fs from 'fs';
import * as path from 'path';
import * as AWS from 'aws-sdk';
import * as logger from '../utils/logger';

/**
 * Uploads a local image file to S3 and returns the public URL
 * @param filePath - Absolute path to the local image file
 * @returns Public HTTPS URL of the uploaded image
 */
export async function uploadLocalImage(filePath: string): Promise<string> {
  // Validate file exists
  if (!fs.existsSync(filePath)) {
    const errorMsg = `File does not exist: ${filePath}`;
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }

  // Validate file is readable
  try {
    fs.accessSync(filePath, fs.constants.R_OK);
  } catch (err) {
    const errorMsg = `File is not readable: ${filePath}`;
    logger.error(errorMsg, err);
    throw new Error(errorMsg);
  }

  // Initialize S3 client
  const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || 'us-east-1',
  });

  const bucketName = process.env.AWS_BUCKET_NAME;
  if (!bucketName) {
    throw new Error('AWS_BUCKET_NAME environment variable is not set');
  }

  // Read file
  const fileContent = fs.readFileSync(filePath);
  const fileName = path.basename(filePath);
  const s3Key = `instagram/${Date.now()}-${fileName}`;

  // Determine content type
  const ext = path.extname(fileName).toLowerCase();
  const contentTypeMap: { [key: string]: string } = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.mp4': 'video/mp4',
  };
  const contentType = contentTypeMap[ext] || 'application/octet-stream';

  // Upload to S3
  const uploadParams: AWS.S3.PutObjectRequest = {
    Bucket: bucketName,
    Key: s3Key,
    Body: fileContent,
    ContentType: contentType,
    // ACL removed - bucket policy will handle public access
  };

  try {
    logger.info(`Uploading image to S3: ${s3Key}`);
    const result = await s3.upload(uploadParams).promise();
    logger.info(`Successfully uploaded image to: ${result.Location}`);
    return result.Location;
  } catch (err) {
    const errorMsg = `Failed to upload image to S3: ${err}`;
    logger.error(errorMsg, err);
    throw new Error(errorMsg);
  }
}

