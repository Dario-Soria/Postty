import { spawn, ChildProcess, spawnSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as logger from '../utils/logger';
import * as readline from 'readline';
import { geminiFailFastEnabled, normalizeGeminiApiKey } from './geminiKey';

const AGENT_DIR = path.join(process.cwd(), 'Agents', 'Product Showcase');

let agentProcess: ChildProcess | null = null;
let isStarting = false;
let isReady = false;
let messageQueue: Array<{
  message: string;
  languageDetectionText?: string;
  imagePath?: string;
  sessionId: string;
  userId?: string;
  preferredLanguage?: string;
  uploadedReference?: { id: string; url: string };
  selectedReference?: { id: string; url: string };
  resolve: (value: any) => void;
  reject: (error: Error) => void;
}> = [];
let currentRequest: { resolve: (value: any) => void; reject: (error: Error) => void } | null = null;

type AgentResult = {
  type: 'text' | 'image' | 'reference_options' | 'post_type_options';
  text: string;
  file?: string;
  references?: any[];
  textLayout?: any;
  postTypes?: any[];
  productThumbnail?: string;
  readyToGenerate?: boolean;
  language?: string;
  languageSource?: string;
  languageSwitched?: boolean;
  languageApplied?: boolean;
  languageError?: string | null;
};

const isDisplayableImageUrl = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  const url = value.trim();
  if (!url) return false;
  return (
    url.startsWith('data:image/') ||
    url.startsWith('blob:') ||
    url.startsWith('http://') ||
    url.startsWith('https://')
  );
};

const sanitizeAgentResult = (raw: AgentResult): AgentResult => {
  if (raw.type !== 'post_type_options') return raw;
  if (!raw.productThumbnail) return raw;
  if (isDisplayableImageUrl(raw.productThumbnail)) return raw;
  logger.warn('[Agent] Dropping non-displayable productThumbnail before route handling');
  const { productThumbnail: _dropInvalidThumbnail, ...rest } = raw;
  return rest;
};

/**
 * Check if the agent process is running and ready
 */
function isAgentRunning(): boolean {
  return agentProcess !== null && isReady;
}

function getAgentSetupHelpText(): string {
  return [
    'Product Showcase agent is not ready (missing Python environment).',
    '',
    'Local setup (run from repo root):',
    '  npm run setup:agent',
    '',
    'Or manually:',
    '  cd "Agents/Product Showcase"',
    '  python3 -m venv .venv',
    '  .venv/bin/pip install -r requirements.txt',
    '',
    'Production/Docker:',
    '  Ensure the image build runs the agent setup script, or set PRODUCT_SHOWCASE_PYTHON to a valid interpreter path.',
  ].join('\n');
}

function resolvePythonCommand(): { cmd: string; argsPrefix: string[] } {
  const envOverride = process.env.PRODUCT_SHOWCASE_PYTHON;
  if (typeof envOverride === 'string' && envOverride.trim()) {
    const cmd = envOverride.trim();
    if (cmd.includes(path.sep) && !fs.existsSync(cmd)) {
      throw new Error(
        `PRODUCT_SHOWCASE_PYTHON was set but does not exist: ${cmd}\n\n${getAgentSetupHelpText()}`
      );
    }
    return { cmd, argsPrefix: [] };
  }

  const venvCandidates = [
    path.join(AGENT_DIR, '.venv', 'bin', 'python3'),
    path.join(AGENT_DIR, '.venv', 'bin', 'python'),
  ];
  for (const candidate of venvCandidates) {
    if (fs.existsSync(candidate)) return { cmd: candidate, argsPrefix: [] };
  }

  const allowSystemPython =
    typeof process.env.PRODUCT_SHOWCASE_ALLOW_SYSTEM_PYTHON === 'string' &&
    process.env.PRODUCT_SHOWCASE_ALLOW_SYSTEM_PYTHON.toLowerCase() === 'true';

  // Default: require the agent venv for deterministic behavior (especially in AWS).
  if (!allowSystemPython) {
    throw new Error(getAgentSetupHelpText());
  }

  // Optional fallback for power users/dev: allow PATH python when explicitly enabled.
  return { cmd: 'python3', argsPrefix: [] };
}

function preflightCheck(pythonCmd: string): void {
  const agentEntry = path.join(AGENT_DIR, 'agent_direct.py');
  if (!fs.existsSync(agentEntry)) {
    throw new Error(`Agent entrypoint missing: ${agentEntry}`);
  }

  // If pythonCmd is an absolute/relative path, ensure it exists.
  if (pythonCmd.includes(path.sep) && !fs.existsSync(pythonCmd)) {
    throw new Error(
      `Python interpreter not found: ${pythonCmd}\n\n${getAgentSetupHelpText()}`
    );
  }

  // Fail fast if the Python environment doesn't have required deps.
  // This is intentionally lightweight and only runs once per startup attempt.
  const probe = spawnSync(pythonCmd, ['-c', 'import google.genai'], {
    cwd: AGENT_DIR,
    env: process.env,
    encoding: 'utf8',
  });
  if (probe.status !== 0) {
    const stderr = (probe.stderr || '').toString().trim();
    const stdout = (probe.stdout || '').toString().trim();
    const details = [stderr, stdout].filter(Boolean).join('\n');
    throw new Error(
      `Python dependencies for Product Showcase agent are not installed for interpreter: ${pythonCmd}\n` +
        (details ? `\n${details}\n` : '\n') +
        `\n${getAgentSetupHelpText()}`
    );
  }

  const normalizedGeminiKey = normalizeGeminiApiKey(process.env.GEMINI_API_KEY);
  if (normalizedGeminiKey !== (process.env.GEMINI_API_KEY || '')) {
    process.env.GEMINI_API_KEY = normalizedGeminiKey;
  }
  if (geminiFailFastEnabled() && !normalizedGeminiKey) {
    throw new Error(
      'Gemini key invalid or missing. Configure GEMINI_API_KEY to start Product Showcase agent.'
    );
  }
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
      const { cmd: pythonCmd, argsPrefix } = resolvePythonCommand();
      preflightCheck(pythonCmd);
      
      // Spawn Python process with stdin/stdout communication
      agentProcess = spawn(pythonCmd, [...argsPrefix, 'agent_direct.py'], {
        cwd: AGENT_DIR,
        env: {
          ...process.env,
          PYTHONUNBUFFERED: '1',
          BACKEND_URL: process.env.BACKEND_URL || 'http://localhost:8080', // Ensure correct backend URL
          POSTTY_INTERNAL_TOKEN: process.env.POSTTY_INTERNAL_TOKEN || '',
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
        // Skip empty lines
        if (!line.trim()) return;
        
        // Try to parse as JSON - skip non-JSON lines (debug messages from Python)
        let response;
        try {
          response = JSON.parse(line);
        } catch (error) {
          // Not JSON - likely a debug message from Python, ignore it
          logger.info(`[Agent Debug] ${line}`);
          return;
        }
        
        logger.info(`[Agent Response] ${JSON.stringify(response)}`);
        
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
            logger.info('[Agent] Success response received');
            currentRequest.resolve(sanitizeAgentResult(response.result as AgentResult));
          } else {
            logger.error(`[Agent] Error response: ${response.message}`);
            currentRequest.reject(new Error(response.message || 'Unknown error'));
          }
          currentRequest = null;
          
          // Process next message in queue
          processQueue();
        } else {
          logger.warn('[Agent] Received response but no current request waiting');
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
  
  // Send message to agent via stdin with optional image_path, session_id, and reference data
  const request: any = { 
    message: item.message,
    language_detection_text: item.languageDetectionText,
    image_path: item.imagePath,
    session_id: item.sessionId,
    user_id: item.userId,
    preferred_language: item.preferredLanguage,
  };
  
  // Include uploaded reference data if present
  if (item.uploadedReference) {
    request.uploaded_reference = item.uploadedReference;
  }
  
  // Include selected reference data if present
  if (item.selectedReference) {
    request.selected_reference = item.selectedReference;
  }
  
  const requestJson = JSON.stringify(request) + '\n';
  
  logger.info(`[Agent Request] Sending: ${JSON.stringify(request)}`);
  agentProcess.stdin?.write(requestJson);
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
 * 
 * @param message - The message to send
 * @param imagePath - Optional path to product image
 * @param sessionId - Session ID for conversation tracking
 * @param userId - User ID for ownership
 * @param uploadedReference - Reference image uploaded by user (id + url)
 * @param selectedReference - Reference image selected from DB (id + url)
 */
export async function sendMessageToAgent(
  message: string,
  languageDetectionText?: string,
  imagePath?: string,
  sessionId: string = 'default',
  userId?: string,
  preferredLanguage?: string,
  uploadedReference?: { id: string; url: string },
  selectedReference?: { id: string; url: string }
): Promise<AgentResult> {
  if (!agentProcess || !isReady) {
    throw new Error('Agent process is not running');
  }

  return new Promise((resolve, reject) => {
    // Add to queue
    messageQueue.push({
      message,
      languageDetectionText,
      imagePath,
      sessionId,
      userId,
      preferredLanguage,
      uploadedReference,
      selectedReference,
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

