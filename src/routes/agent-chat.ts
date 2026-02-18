import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as logger from '../utils/logger';
import * as path from 'path';
import * as fs from 'fs/promises';
import { sendMessageToAgent, ensureAgentRunning } from '../services/productShowcaseAgent';
import { uploadLocalImage } from '../services/imageUploader';
import { saveReferenceImageAsync } from '../services/referenceLibrarySqlite';
import { getSignedGetObjectUrl } from '../services/s3Client';

interface AgentChatBody {
  agentType: string;
  message: string;
  conversationHistory?: string;
}

export default async function agentChatRoute(fastify: FastifyInstance): Promise<void> {
  fastify.post('/agent-chat', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Extract form fields
      const fields: Record<string, any> = {};
      let imageFile: { filename: string; path: string } | null = null;

      // Process all parts using multipart iterator
      const parts = request.parts();
      for await (const part of parts) {
        if (part.type === 'field') {
          fields[part.fieldname] = part.value;
        } else if (part.type === 'file' && part.fieldname === 'image') {
          // Save uploaded image to temp folder
          const tempDir = path.join(process.cwd(), 'temp-uploads');
          await fs.mkdir(tempDir, { recursive: true });
          
          const filename = `agent-upload-${Date.now()}-${part.filename}`;
          const filepath = path.join(tempDir, filename);
          
          await fs.writeFile(filepath, await part.toBuffer());
          imageFile = { filename, path: filepath };
        }
      }

      const {
        agentType,
        message,
        conversationHistory,
        userId,
        isReferenceUpload,
        selectedReferenceId,
        selectedReferenceUrl,
        selectedPostType,
      } = fields;

      if (!agentType) {
        return reply.status(400).send({
          status: 'error',
          message: 'Missing required field: agentType',
        });
      }

      // Allow empty message if image is provided
      if (message === undefined && !imageFile) {
        return reply.status(400).send({
          status: 'error',
          message: 'Missing required field: message (or provide an image)',
        });
      }

      // Handle user-uploaded reference image
      let uploadedReferenceData: { id: string; url: string } | null = null;
      if (isReferenceUpload === 'true' && imageFile) {
        logger.info(`[Agent Chat] Processing user-uploaded reference image: ${imageFile.filename}`);
        try {
          // Read the uploaded file
          const buffer = await fs.readFile(imageFile.path);
          const mime = imageFile.filename.toLowerCase().endsWith('.png') ? 'image/png' 
            : imageFile.filename.toLowerCase().endsWith('.webp') ? 'image/webp' 
            : 'image/jpeg';
          
          // Save to S3 and DB (async indexing happens in background)
          const savedRef = await saveReferenceImageAsync({
            buffer,
            originalFilename: imageFile.filename,
            mime,
            ownerUid: typeof userId === 'string' ? userId : undefined,
          });
          
          if (savedRef) {
            // Get signed URL for the uploaded reference
            const signedUrl = await getSignedGetObjectUrl({
              bucket: savedRef.s3_bucket,
              key: savedRef.s3_key,
              expiresSeconds: 60 * 60, // 1 hour
            });
            
            uploadedReferenceData = {
              id: savedRef.id,
              url: signedUrl,
            };
            logger.info(`[Agent Chat] User reference uploaded successfully: id=${savedRef.id}`);
          }
        } catch (err) {
          logger.error(`[Agent Chat] Failed to upload user reference:`, err);
          // Continue without the reference - let agent handle gracefully
        }
      }

      // Only support product-showcase for now
      if (agentType !== 'product-showcase') {
        return reply.send({
          type: 'text',
          text: 'Este agente aún no está disponible. Próximamente.',
        });
      }

      // Allow client-provided sessionId (used to force a true "start over" / fresh run)
      const clientSessionIdRaw = fields.sessionId;
      const clientSessionId =
        typeof clientSessionIdRaw === 'string' && clientSessionIdRaw.trim()
          ? clientSessionIdRaw.trim()
          : undefined;

      // Extract userId with fallback for backward compatibility
      const sessionId =
        clientSessionId || userId || `anon-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      logger.info(`[Agent Chat] Session ID: ${sessionId.substring(0, 12)}...`);

      const userUid =
        typeof userId === 'string' && userId.trim().length > 0 ? userId.trim() : undefined;

      // Ensure the Python agent process is running
      logger.info(`[Agent Chat] Ensuring agent is running...`);
      try {
        await ensureAgentRunning();
      } catch (err) {
        const details = err instanceof Error ? err.message : String(err);
        logger.error('[Agent Chat] Agent startup failed:', details);
        return reply.status(503).send({
          status: 'error',
          message: 'Agent is not available (setup required)',
          details,
        });
      }

      // Build message to send to agent
      let messageToSend = message || (imageFile ? "" : "");

      // Deterministic post-type selection (sent by the /v3 UI when a user taps a post type card).
      // This avoids relying on label text parsing, which can be brittle across locales/casing.
      if (
        typeof selectedPostType === 'string' &&
        selectedPostType.trim().length > 0 &&
        !uploadedReferenceData &&
        !(selectedReferenceId && selectedReferenceUrl)
      ) {
        messageToSend = selectedPostType.trim();
      }
      
      // If user uploaded a reference, modify the message to include reference data
      if (uploadedReferenceData) {
        // Don't send the image file to agent (it's not a product image)
        // Instead, send a special message with the reference data
        messageToSend = `[User uploaded reference: ${uploadedReferenceData.id}]`;
        logger.info(`[Agent Chat] Sending uploaded reference to agent: id=${uploadedReferenceData.id}`);
      }
      
      // Handle reference selection from DB (when user clicks on a reference card)
      if (selectedReferenceId && selectedReferenceUrl) {
        messageToSend = `[User selected reference: ${selectedReferenceId}]`;
        logger.info(`[Agent Chat] User selected reference: ${selectedReferenceId}`);
      }

      // Send message to Python agent with image path and session ID
      // Don't send image path if it's a reference upload (not a product)
      const imagePath = uploadedReferenceData ? undefined : imageFile?.path;
      logger.info(`[Agent Chat] Sending message: "${messageToSend}", image: ${imagePath || 'none'}`);
      const result = await sendMessageToAgent(
        messageToSend, 
        imagePath, 
        sessionId, 
        userUid, 
        uploadedReferenceData || undefined, 
        selectedReferenceId && selectedReferenceUrl ? { id: selectedReferenceId, url: selectedReferenceUrl } : undefined
      );
      logger.info(`[Agent Chat] Received result type: ${result.type}`);

      // Handle different response types
      if (result.type === 'post_type_options') {
        // Post type options with example images
        return reply.send({
          type: 'post_type_options',
          text: result.text,
          productThumbnail: result.productThumbnail,
          postTypes: result.postTypes,
        });
      }
      
      if (result.type === 'reference_options') {
        // Reference images are being presented to user
        return reply.send({
          type: 'reference_options',
          text: result.text,
          references: result.references,
        });
      }
      
      if (result.type === 'image' && result.file) {
        // V2: Return local URL immediately, upload to S3 in background
        // This improves UX by showing the image faster
        const filename = path.basename(result.file);
        // IMPORTANT: `http://localhost:*` breaks when the UI is opened from another device
        // (e.g. phone on LAN). Prefer a configured public base URL, otherwise return a
        // relative path that the frontend can proxy.
        const publicBase = (process.env.POSTTY_PUBLIC_BACKEND_URL || process.env.POSTTY_PUBLIC_BASE_URL || '')
          .trim()
          .replace(/\/+$/, '');
        const localUrl = publicBase ? `${publicBase}/generated-images/${filename}` : `/generated-images/${filename}`;
        
        logger.info(`Serving image locally first: ${localUrl}`);
        
        // Upload to S3 in background (don't await)
        uploadLocalImage(result.file)
          .then((s3Url) => {
            logger.info(`Background S3 upload completed: ${s3Url}`);
          })
          .catch((err) => {
            logger.error(`Background S3 upload failed: ${err}`);
          });
        
        const response: any = {
          type: 'image',
          text: result.text,
          imageUrl: localUrl,  // Local URL for immediate display
        };
        
        // Include textLayout if present
        if (result.textLayout) {
          response.textLayout = result.textLayout;
        }
        
        return reply.send(response);
      }

      // Text response
      const textResponse: any = {
        type: 'text',
        text: result.text,
      };
      
      // Include readyToGenerate if present
      if (result.readyToGenerate !== undefined) {
        textResponse.readyToGenerate = result.readyToGenerate;
      }
      
      return reply.send(textResponse);

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Agent chat error:', errorMsg);
      
      return reply.status(500).send({
        status: 'error',
        message: 'Error communicating with agent',
        details: errorMsg,
      });
    }
  });

  logger.info('✅ Agent chat route registered: POST /agent-chat');
}

