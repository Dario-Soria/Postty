import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import * as logger from '../../utils/logger';

function isEnabled(): boolean {
  const v = (process.env.V2_USE_REMBG || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

function resolvePythonBin(): string {
  return (process.env.PYTHON_BIN || 'python3').trim();
}

function resolveScriptPath(): string {
  return path.join(process.cwd(), 'scripts', 'rembg_cutout.py');
}

export async function tryRembgCutout(params: {
  inputPath: string;
  outputPath: string;
  timeoutMs?: number;
}): Promise<boolean> {
  if (!isEnabled()) return false;
  const script = resolveScriptPath();
  if (!fs.existsSync(script)) return false;

  const python = resolvePythonBin();
  const timeoutMs = params.timeoutMs ?? 45_000;

  return await new Promise<boolean>((resolve) => {
    const child = spawn(python, [script, params.inputPath, params.outputPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';
    child.stderr.on('data', (d) => (stderr += String(d)));

    const to = setTimeout(() => {
      child.kill('SIGKILL');
      logger.warn('rembg cutout timed out; falling back.');
      resolve(false);
    }, timeoutMs);

    child.on('close', (code) => {
      clearTimeout(to);
      if (code === 0 && fs.existsSync(params.outputPath)) return resolve(true);
      if (stderr.trim()) logger.warn(`rembg cutout failed (code=${code}): ${stderr.trim()}`);
      resolve(false);
    });
  });
}


