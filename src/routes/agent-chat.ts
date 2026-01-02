import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as logger from '../utils/logger';
import * as path from 'path';
import * as fs from 'fs/promises';
import { sendMessageToAgent, ensureAgentRunning } from '../services/productShowcaseAgent';

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

      const { agentType, message, conversationHistory } = fields;

      if (!agentType || !message) {
        return reply.status(400).send({
          status: 'error',
          message: 'Missing required fields: agentType, message',
        });
      }

      // Only support product-showcase for now
      if (agentType !== 'product-showcase') {
        return reply.send({
          type: 'text',
          text: 'Este agente aún no está disponible. Próximamente.',
        });
      }

      // Ensure the Python agent process is running
      await ensureAgentRunning();

      // Send message to Python agent
      const result = await sendMessageToAgent(message, imageFile?.path);

      // Clean up uploaded image if it exists
      if (imageFile) {
        try {
          await fs.unlink(imageFile.path);
        } catch (err) {
          logger.warn('Failed to delete temp image:', err);
        }
      }

      // Handle different response types
      if (result.type === 'image' && result.file) {
        // Image was generated, move it to generated-images and return URL
        const generatedImagesDir = path.join(process.cwd(), 'generated-images');
        await fs.mkdir(generatedImagesDir, { recursive: true });
        
        const sourceFile = path.join(process.cwd(), 'Agents', 'Product Showcase', result.file);
        const destFile = path.join(generatedImagesDir, result.file);
        
        try {
          await fs.copyFile(sourceFile, destFile);
          // Clean up source file
          await fs.unlink(sourceFile);
        } catch (err) {
          logger.warn('Failed to move generated image:', err);
        }

        return reply.send({
          type: 'image',
          text: result.text,
          imageUrl: `/generated-images/${result.file}`,
        });
      }

      // Text response
      return reply.send({
        type: 'text',
        text: result.text,
      });

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

