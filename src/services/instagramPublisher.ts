import axios from 'axios';
import * as logger from '../utils/logger';

const GRAPH_API_VERSION = process.env.GRAPH_API_VERSION || 'v19.0';
const INSTAGRAM_USER_ID = process.env.INSTAGRAM_USER_ID;
const INSTAGRAM_ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN;

// Polling configuration
const POLL_INTERVAL_MS = 2000; // 2 seconds
const MAX_POLL_ATTEMPTS = 60; // 2 minutes max (60 * 2s)
const PUBLISH_RETRY_DELAY_MS = 2000; // 2 seconds
const MAX_PUBLISH_ATTEMPTS = 10;

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

export type InstagramVideoKind = 'VIDEO' | 'STORIES' | 'REELS';

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
  const publishedPost = await publishContainerWithRetry(containerId);
  logger.info(`Successfully published Instagram post: ${publishedPost.id}`);

  return publishedPost;
}

/**
 * Publishes a VIDEO to Instagram using a public HTTPS URL.
 * This is additive and does NOT change existing image behavior.
 *
 * Note: For now, callers should use kind='VIDEO' for a feed video post.
 * Later we can add UI/agent selection for 'STORIES' or 'REELS'.
 */
export async function publishInstagramVideo(params: {
  videoUrl: string;
  caption?: string;
  kind: InstagramVideoKind;
  shareToFeed?: boolean;
  maxPollAttempts?: number;
}): Promise<{ id: string }> {
  if (!INSTAGRAM_USER_ID) {
    throw new Error('INSTAGRAM_USER_ID environment variable is not set');
  }

  if (!INSTAGRAM_ACCESS_TOKEN) {
    throw new Error('INSTAGRAM_ACCESS_TOKEN environment variable is not set');
  }

  if (!params.videoUrl || typeof params.videoUrl !== 'string') {
    throw new Error('videoUrl is required');
  }

  // Instagram Graph API requires a publicly accessible HTTPS URL.
  if (!params.videoUrl.toLowerCase().startsWith('https://')) {
    throw new Error('videoUrl must be a public HTTPS URL');
  }

  logger.info(`Creating Instagram VIDEO media container (kind=${params.kind})...`);
  const containerId = await createVideoMediaContainer({
    videoUrl: params.videoUrl,
    caption: params.caption,
    kind: params.kind,
    shareToFeed: params.shareToFeed,
  });
  logger.info(`Media container created: ${containerId}`);

  logger.info('Polling container status...');
  await pollContainerStatus(containerId, { maxPollAttempts: params.maxPollAttempts });
  logger.info('Container is ready for publishing');

  logger.info('Publishing Instagram media...');
  const publishedPost = await publishContainerWithRetry(containerId);
  logger.info(`Successfully published Instagram media: ${publishedPost.id}`);

  return publishedPost;
}

export async function getInstagramPermalink(mediaId: string): Promise<string> {
  if (!INSTAGRAM_ACCESS_TOKEN) {
    throw new Error('INSTAGRAM_ACCESS_TOKEN environment variable is not set');
  }
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${mediaId}`;
  try {
    const response = await axios.get(url, {
      params: {
        fields: 'permalink',
        access_token: INSTAGRAM_ACCESS_TOKEN,
      },
    });
    const permalink = response?.data?.permalink;
    if (!permalink || typeof permalink !== 'string') {
      throw new Error('No permalink returned from Instagram');
    }
    return permalink;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const errorMsg = `Failed to fetch permalink: ${
        error.response?.data?.error?.message || error.message
      }`;
      logger.error(errorMsg, error.response?.data);
      throw new Error(errorMsg);
    }
    throw error;
  }
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
 * Creates an Instagram VIDEO media container.
 * Uses video_url + media_type (VIDEO | STORIES | REELS).
 */
async function createVideoMediaContainer(params: {
  videoUrl: string;
  caption?: string;
  kind: InstagramVideoKind;
  shareToFeed?: boolean;
}): Promise<string> {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${INSTAGRAM_USER_ID}/media`;

  const requestParams: Record<string, any> = {
    video_url: params.videoUrl,
    media_type: params.kind,
    access_token: INSTAGRAM_ACCESS_TOKEN,
  };

  if (params.caption && params.caption.trim().length > 0) {
    requestParams.caption = params.caption;
  }

  if (typeof params.shareToFeed === 'boolean') {
    requestParams.share_to_feed = params.shareToFeed;
  }

  try {
    const response = await axios.post<MediaContainerResponse>(url, null, {
      params: requestParams,
    });

    return response.data.id;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const errorMsg = `Failed to create video media container: ${
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
async function pollContainerStatus(
  containerId: string,
  opts?: { maxPollAttempts?: number }
): Promise<void> {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${containerId}`;
  const maxAttempts = opts?.maxPollAttempts ?? MAX_POLL_ATTEMPTS;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await axios.get<ContainerStatusResponse>(url, {
        params: {
          fields: 'status_code',
          access_token: INSTAGRAM_ACCESS_TOKEN,
        },
      });

      const statusCode = response.data.status_code;
      logger.info(`Container status (attempt ${attempt}/${maxAttempts}): ${statusCode}`);

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
      if (attempt < maxAttempts) {
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
    `Container did not become ready after ${maxAttempts} attempts`
  );
}

function isTransientPublishNotReadyError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  const igErr = (error.response?.data as any)?.error;
  const code = typeof igErr?.code === 'number' ? igErr.code : null;
  const subcode = typeof igErr?.error_subcode === 'number' ? igErr.error_subcode : null;
  const message = typeof igErr?.message === 'string' ? igErr.message : '';
  const userMsg = typeof igErr?.error_user_msg === 'string' ? igErr.error_user_msg : '';
  const combined = `${message} ${userMsg}`.toLowerCase();

  return (
    code === 9007 ||
    subcode === 2207027 ||
    combined.includes('media id is not available') ||
    combined.includes('not ready for publishing')
  );
}

async function publishContainerWithRetry(containerId: string): Promise<{ id: string }> {
  for (let attempt = 1; attempt <= MAX_PUBLISH_ATTEMPTS; attempt++) {
    try {
      return await publishContainer(containerId);
    } catch (e) {
      if (!isTransientPublishNotReadyError(e) || attempt >= MAX_PUBLISH_ATTEMPTS) {
        throw e;
      }

      logger.warn(
        `Publish not ready yet (transient). Retrying publish in ${PUBLISH_RETRY_DELAY_MS}ms (attempt ${attempt}/${MAX_PUBLISH_ATTEMPTS})...`
      );

      // Give IG a moment; sometimes status is FINISHED but publish isn't available yet.
      await sleep(PUBLISH_RETRY_DELAY_MS);
      // Best-effort: re-check status once (does not change behavior; just avoids hammering publish).
      try {
        await pollContainerStatus(containerId, { maxPollAttempts: 1 });
      } catch {
        // ignore
      }
    }
  }

  // Should be unreachable because loop either returns or throws.
  throw new Error('Failed to publish container after retries');
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

