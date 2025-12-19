import axios from 'axios';
import * as logger from '../utils/logger';

const GRAPH_API_VERSION = process.env.GRAPH_API_VERSION || 'v19.0';
const INSTAGRAM_USER_ID = process.env.INSTAGRAM_USER_ID;
const INSTAGRAM_ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN;

// Polling configuration
const POLL_INTERVAL_MS = 2000; // 2 seconds
const MAX_POLL_ATTEMPTS = 60; // 2 minutes max (60 * 2s)

interface MediaContainerResponse {
  id: string;
}

interface ContainerStatusResponse {
  status_code: 'IN_PROGRESS' | 'FINISHED' | 'ERROR' | 'EXPIRED';
  id: string;
}

interface PublishResponse {
  id: string;
}

/**
 * Publishes an image to Instagram with the given caption
 * @param imageUrl - Public HTTPS URL of the image
 * @param caption - Caption text for the Instagram post
 * @returns Object containing the published media ID
 */
export async function publishInstagramPost(
  imageUrl: string,
  caption: string
): Promise<{ id: string }> {
  if (!INSTAGRAM_USER_ID) {
    throw new Error('INSTAGRAM_USER_ID environment variable is not set');
  }

  if (!INSTAGRAM_ACCESS_TOKEN) {
    throw new Error('INSTAGRAM_ACCESS_TOKEN environment variable is not set');
  }

  // Step 1: Create media container
  logger.info('Creating Instagram media container...');
  const containerId = await createMediaContainer(imageUrl, caption);
  logger.info(`Media container created: ${containerId}`);

  // Step 2: Poll container status until ready
  logger.info('Polling container status...');
  await pollContainerStatus(containerId);
  logger.info('Container is ready for publishing');

  // Step 3: Publish the container
  logger.info('Publishing Instagram post...');
  const publishedPost = await publishContainer(containerId);
  logger.info(`Successfully published Instagram post: ${publishedPost.id}`);

  return publishedPost;
}

/**
 * Creates an Instagram media container
 */
async function createMediaContainer(
  imageUrl: string,
  caption: string
): Promise<string> {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${INSTAGRAM_USER_ID}/media`;

  try {
    const response = await axios.post<MediaContainerResponse>(url, null, {
      params: {
        image_url: imageUrl,
        caption: caption,
        access_token: INSTAGRAM_ACCESS_TOKEN,
      },
    });

    return response.data.id;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const errorMsg = `Failed to create media container: ${
        error.response?.data?.error?.message || error.message
      }`;
      logger.error(errorMsg, error.response?.data);
      throw new Error(errorMsg);
    }
    throw error;
  }
}

/**
 * Polls the container status until it's ready or fails
 */
async function pollContainerStatus(containerId: string): Promise<void> {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${containerId}`;

  for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt++) {
    try {
      const response = await axios.get<ContainerStatusResponse>(url, {
        params: {
          fields: 'status_code',
          access_token: INSTAGRAM_ACCESS_TOKEN,
        },
      });

      const statusCode = response.data.status_code;
      logger.info(`Container status (attempt ${attempt}): ${statusCode}`);

      if (statusCode === 'FINISHED') {
        return;
      }

      if (statusCode === 'ERROR') {
        throw new Error('Media container processing failed with ERROR status');
      }

      if (statusCode === 'EXPIRED') {
        throw new Error('Media container expired before processing completed');
      }

      // Status is IN_PROGRESS, wait before polling again
      if (attempt < MAX_POLL_ATTEMPTS) {
        await sleep(POLL_INTERVAL_MS);
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const errorMsg = `Failed to check container status: ${
          error.response?.data?.error?.message || error.message
        }`;
        logger.error(errorMsg, error.response?.data);
        throw new Error(errorMsg);
      }
      throw error;
    }
  }

  throw new Error(
    `Container did not become ready after ${MAX_POLL_ATTEMPTS} attempts`
  );
}

/**
 * Publishes a ready media container to Instagram
 */
async function publishContainer(containerId: string): Promise<{ id: string }> {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${INSTAGRAM_USER_ID}/media_publish`;

  try {
    const response = await axios.post<PublishResponse>(url, null, {
      params: {
        creation_id: containerId,
        access_token: INSTAGRAM_ACCESS_TOKEN,
      },
    });

    return { id: response.data.id };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const errorMsg = `Failed to publish container: ${
        error.response?.data?.error?.message || error.message
      }`;
      logger.error(errorMsg, error.response?.data);
      throw new Error(errorMsg);
    }
    throw error;
  }
}

/**
 * Utility function to sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

