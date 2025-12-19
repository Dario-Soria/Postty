/**
 * Simple logger utility with timestamp prefixes
 */

function getTimestamp(): string {
  return new Date().toISOString();
}

export function info(message: string, ...args: any[]): void {
  console.log(`[${getTimestamp()}] INFO:`, message, ...args);
}

export function error(message: string, ...args: any[]): void {
  console.error(`[${getTimestamp()}] ERROR:`, message, ...args);
}

export function warn(message: string, ...args: any[]): void {
  console.warn(`[${getTimestamp()}] WARN:`, message, ...args);
}

