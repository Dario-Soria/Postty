import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as logger from '../utils/logger';
import * as readline from 'readline';

const AGENT_DIR = path.join(process.cwd(), 'Agents', 'Product Showcase');

let agentProcess: ChildProcess | null = null;
let isStarting = false;
let isReady = false;
let messageQueue: Array<{
  message: string;
  resolve: (value: any) => void;
  reject: (error: Error) => void;
}> = [];
let currentRequest: { resolve: (value: any) => void; reject: (error: Error) => void } | null = null;

/**
 * Check if the agent process is running and ready
 */
function isAgentRunning(): boolean {
  return agentProcess !== null && isReady;
}

/**
 * Start the agent process with direct stdin/stdout communication
 */
async function startAgentProcess(): Promise<void> {
  if (agentProcess || isStarting) {
    logger.info('Agent process already starting or running');
    return;
  }

  isStarting = true;
  isReady = false;
  logger.info('Starting Product Showcase Agent process...');

  return new Promise((resolve, reject) => {
    try {
      // Use virtual environment Python
      const venvPython = path.join(AGENT_DIR, '.venv', 'bin', 'python3');
      
      // Spawn Python process with stdin/stdout communication
      agentProcess = spawn(venvPython, ['agent_direct.py'], {
        cwd: AGENT_DIR,
        env: {
          ...process.env,
          PYTHONUNBUFFERED: '1',
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // Set up readline interface for stdout
      const rl = readline.createInterface({
        input: agentProcess.stdout!,
        crlfDelay: Infinity,
      });

      // Process responses from agent
      rl.on('line', (line) => {
        try {
          const response = JSON.parse(line);
          
          // Handle ready signal
          if (response.status === 'ready') {
            logger.info(`✅ Agent process ready: ${response.agent_id}`);
            isReady = true;
            isStarting = false;
            resolve();
            
            // Process queued messages
            processQueue();
            return;
          }
          
          // Handle regular responses
          if (currentRequest) {
            if (response.status === 'success') {
              currentRequest.resolve(response.result);
            } else {
              currentRequest.reject(new Error(response.message || 'Unknown error'));
            }
            currentRequest = null;
            
            // Process next message in queue
            processQueue();
          }
        } catch (error) {
          logger.error('Failed to parse agent response:', line);
        }
      });

      // Log stderr
      agentProcess.stderr?.on('data', (data) => {
        logger.error(`[Agent Error] ${data.toString().trim()}`);
      });

      // Handle process errors
      agentProcess.on('error', (error) => {
        logger.error('Agent process error:', error);
        agentProcess = null;
        isStarting = false;
        isReady = false;
        reject(error);
      });

      // Handle process exit
      agentProcess.on('exit', (code, signal) => {
        logger.info(`Agent process exited with code ${code} and signal ${signal}`);
        agentProcess = null;
        isStarting = false;
        isReady = false;
        
        // Reject any pending requests
        if (currentRequest) {
          currentRequest.reject(new Error('Agent process exited'));
          currentRequest = null;
        }
        messageQueue.forEach(item => item.reject(new Error('Agent process exited')));
        messageQueue = [];
      });

      // Timeout if agent doesn't start
      setTimeout(() => {
        if (!isReady && isStarting) {
          isStarting = false;
          reject(new Error('Agent process failed to start within timeout'));
        }
      }, 10000); // 10 second timeout

    } catch (error) {
      isStarting = false;
      agentProcess = null;
      reject(error);
    }
  });
}

/**
 * Process queued messages
 */
function processQueue(): void {
  if (currentRequest || messageQueue.length === 0 || !agentProcess || !isReady) {
    return;
  }

  const item = messageQueue.shift();
  if (!item) return;

  currentRequest = { resolve: item.resolve, reject: item.reject };
  
  // Send message to agent via stdin
  const request = JSON.stringify({ message: item.message }) + '\n';
  agentProcess.stdin?.write(request);
}

/**
 * Ensure the agent process is running, start it if not
 */
export async function ensureAgentRunning(): Promise<void> {
  if (isAgentRunning()) {
    return;
  }

  if (isStarting) {
    // Wait for current startup to complete
    await new Promise((resolve) => {
      const check = setInterval(() => {
        if (!isStarting) {
          clearInterval(check);
          resolve(undefined);
        }
      }, 100);
    });
    return;
  }

  logger.info('Agent process not running, starting it...');
  await startAgentProcess();
}

/**
 * Send a message to the agent and get a response
 */
export async function sendMessageToAgent(
  message: string,
  imagePath?: string
): Promise<{ type: 'text' | 'image'; text: string; file?: string }> {
  if (!agentProcess || !isReady) {
    throw new Error('Agent process is not running');
  }

  // Add image path to message if provided
  const fullMessage = imagePath ? `${message} ${imagePath}` : message;

  return new Promise((resolve, reject) => {
    // Add to queue
    messageQueue.push({
      message: fullMessage,
      resolve,
      reject,
    });

    // Start processing if not already processing
    processQueue();

    // Timeout after 2 minutes
    setTimeout(() => {
      const index = messageQueue.findIndex(item => item.resolve === resolve);
      if (index !== -1) {
        messageQueue.splice(index, 1);
        reject(new Error('Agent request timeout'));
      }
      if (currentRequest?.resolve === resolve) {
        currentRequest = null;
        reject(new Error('Agent request timeout'));
      }
    }, 120000);
  });
}

/**
 * Stop the agent process (for cleanup)
 */
export function stopAgentProcess(): void {
  if (agentProcess) {
    logger.info('Stopping agent process...');
    agentProcess.kill();
    agentProcess = null;
    isReady = false;
    currentRequest = null;
    messageQueue = [];
  }
}

// Cleanup on process exit
process.on('exit', () => {
  stopAgentProcess();
});

process.on('SIGINT', () => {
  stopAgentProcess();
  process.exit(0);
});

process.on('SIGTERM', () => {
  stopAgentProcess();
  process.exit(0);
});

