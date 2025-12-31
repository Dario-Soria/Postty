import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as logger from '../utils/logger';

const META_APP_ID = process.env.META_APP_ID || '242458132799811';
const META_APP_SECRET = process.env.META_APP_SECRET || 'daf97273d59ebb8229e476a65a11ad59';
const REDIRECT_URI = process.env.META_REDIRECT_URI || 'https://0fb9827c518d.ngrok-free.app/api/auth/instagram/callback';

// Scopes needed for Instagram publishing
const SCOPES = [
  'instagram_basic',
  'instagram_content_publish', 
  'pages_show_list',
  'pages_read_engagement',
  'business_management'
].join(',');

export default async function instagramAuthRoutes(fastify: FastifyInstance): Promise<void> {
  
  // Step 1: Redirect user to Facebook OAuth
  fastify.get('/auth/instagram', async (request: FastifyRequest, reply: FastifyReply) => {
    logger.info('🔗 GET /auth/instagram - Starting Instagram OAuth flow');
    
    // Generate state for CSRF protection
    const state = Math.random().toString(36).substring(7);
    
    const authUrl = new URL('https://www.facebook.com/v18.0/dialog/oauth');
    authUrl.searchParams.set('client_id', META_APP_ID);
    authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
    authUrl.searchParams.set('scope', SCOPES);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('state', state);
    
    logger.info(`Redirecting to: ${authUrl.toString()}`);
    return reply.redirect(authUrl.toString());
  });

  // Step 2: Handle OAuth callback
  fastify.get('/auth/instagram/callback', async (request: FastifyRequest, reply: FastifyReply) => {
    logger.info('🔙 GET /auth/instagram/callback - Handling OAuth callback');
    
    const { code, error, error_description } = request.query as {
      code?: string;
      error?: string;
      error_description?: string;
    };

    if (error) {
      logger.error(`OAuth error: ${error} - ${error_description}`);
      return reply.redirect(`/v2?error=${encodeURIComponent(error_description || error)}`);
    }

    if (!code) {
      logger.error('No code received from OAuth');
      return reply.redirect('/v2?error=no_code');
    }

    try {
      // Exchange code for access token
      const tokenUrl = new URL('https://graph.facebook.com/v18.0/oauth/access_token');
      tokenUrl.searchParams.set('client_id', META_APP_ID);
      tokenUrl.searchParams.set('client_secret', META_APP_SECRET);
      tokenUrl.searchParams.set('redirect_uri', REDIRECT_URI);
      tokenUrl.searchParams.set('code', code);

      const tokenResponse = await fetch(tokenUrl.toString());
      const tokenData = await tokenResponse.json() as any;

      if (tokenData.error) {
        throw new Error(tokenData.error.message);
      }

      const shortLivedToken = tokenData.access_token;
      logger.info('✅ Got short-lived token');

      // Exchange for long-lived token (60 days)
      const longLivedUrl = new URL('https://graph.facebook.com/v18.0/oauth/access_token');
      longLivedUrl.searchParams.set('grant_type', 'fb_exchange_token');
      longLivedUrl.searchParams.set('client_id', META_APP_ID);
      longLivedUrl.searchParams.set('client_secret', META_APP_SECRET);
      longLivedUrl.searchParams.set('fb_exchange_token', shortLivedToken);

      const longLivedResponse = await fetch(longLivedUrl.toString());
      const longLivedData = await longLivedResponse.json() as any;

      if (longLivedData.error) {
        throw new Error(longLivedData.error.message);
      }

      const accessToken = longLivedData.access_token;
      const expiresIn = longLivedData.expires_in; // seconds
      logger.info(`✅ Got long-lived token (expires in ${expiresIn} seconds)`);

      // Get user's Facebook pages
      const pagesResponse = await fetch(
        `https://graph.facebook.com/v18.0/me/accounts?access_token=${accessToken}`
      );
      const pagesData = await pagesResponse.json() as any;

      if (!pagesData.data || pagesData.data.length === 0) {
        throw new Error('No Facebook pages found. You need a Facebook Page connected to your Instagram Business account.');
      }

      logger.info(`📄 Found ${pagesData.data.length} Facebook page(s)`);

      // Get Instagram Business Account for each page
      let instagramAccount = null;
      for (const page of pagesData.data) {
        const igResponse = await fetch(
          `https://graph.facebook.com/v18.0/${page.id}?fields=instagram_business_account&access_token=${accessToken}`
        );
        const igData = await igResponse.json() as any;

        if (igData.instagram_business_account) {
          // Get Instagram username
          const igDetailsResponse = await fetch(
            `https://graph.facebook.com/v18.0/${igData.instagram_business_account.id}?fields=username,profile_picture_url&access_token=${accessToken}`
          );
          const igDetails = await igDetailsResponse.json() as any;

          instagramAccount = {
            id: igData.instagram_business_account.id,
            username: igDetails.username,
            profilePicture: igDetails.profile_picture_url,
            pageId: page.id,
            pageName: page.name,
            pageAccessToken: page.access_token
          };
          break;
        }
      }

      if (!instagramAccount) {
        throw new Error('No Instagram Business account found. Make sure your Instagram is connected to a Facebook Page.');
      }

      logger.info(`📸 Found Instagram account: @${instagramAccount.username}`);

      // Return success with account data (in production, save to database)
      const successData = {
        success: true,
        instagram: {
          id: instagramAccount.id,
          username: instagramAccount.username,
          profilePicture: instagramAccount.profilePicture
        },
        accessToken: accessToken,
        pageAccessToken: instagramAccount.pageAccessToken,
        expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString()
      };

      // Redirect to frontend with success
      const encodedData = encodeURIComponent(JSON.stringify(successData));
      return reply.redirect(`/v2?instagram_connected=true&data=${encodedData}`);

    } catch (error) {
      logger.error('OAuth callback error:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      return reply.redirect(`/v2?error=${encodeURIComponent(message)}`);
    }
  });

  // API endpoint to get connection status
  fastify.get('/auth/instagram/status', async (request: FastifyRequest, reply: FastifyReply) => {
    // In production, check database for user's Instagram connection
    return reply.send({
      connected: false,
      message: 'Check localStorage for instagram_data'
    });
  });

  // API endpoint to publish to Instagram
  fastify.post('/instagram/publish', async (request: FastifyRequest, reply: FastifyReply) => {
    logger.info('📤 POST /instagram/publish - Publishing to Instagram');

    const { imageUrl, caption, accessToken, instagramAccountId } = request.body as {
      imageUrl: string;
      caption: string;
      accessToken: string;
      instagramAccountId: string;
    };

    if (!imageUrl || !accessToken || !instagramAccountId) {
      return reply.status(400).send({
        success: false,
        error: 'Missing required fields: imageUrl, accessToken, instagramAccountId'
      });
    }

    try {
      // Step 1: Create media container
      const createMediaUrl = new URL(`https://graph.facebook.com/v18.0/${instagramAccountId}/media`);
      createMediaUrl.searchParams.set('image_url', imageUrl);
      createMediaUrl.searchParams.set('caption', caption || '');
      createMediaUrl.searchParams.set('access_token', accessToken);

      const createResponse = await fetch(createMediaUrl.toString(), { method: 'POST' });
      const createData = await createResponse.json() as any;

      if (createData.error) {
        throw new Error(createData.error.message);
      }

      const containerId = createData.id;
      logger.info(`✅ Created media container: ${containerId}`);

      // Step 2: Publish the container
      const publishUrl = new URL(`https://graph.facebook.com/v18.0/${instagramAccountId}/media_publish`);
      publishUrl.searchParams.set('creation_id', containerId);
      publishUrl.searchParams.set('access_token', accessToken);

      const publishResponse = await fetch(publishUrl.toString(), { method: 'POST' });
      const publishData = await publishResponse.json() as any;

      if (publishData.error) {
        throw new Error(publishData.error.message);
      }

      logger.info(`✅ Published to Instagram: ${publishData.id}`);

      return reply.send({
        success: true,
        postId: publishData.id,
        message: 'Successfully published to Instagram!'
      });

    } catch (error) {
      logger.error('Instagram publish error:', error);
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to publish'
      });
    }
  });
}

