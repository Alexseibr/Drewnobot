import { spawn, ChildProcess } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MAX_RESTARTS = 10;
const RESTART_WINDOW_MS = 60000; // 1 minute
const RESTART_DELAY_MS = 2000; // 2 seconds

let restartCount = 0;
let lastRestartTime = Date.now();
let childProcess: ChildProcess | null = null;

function log(message: string) {
  const timestamp = new Date().toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
  console.log(`${timestamp} [watchdog] ${message}`);
}

function startServer() {
  const now = Date.now();
  
  if (now - lastRestartTime > RESTART_WINDOW_MS) {
    restartCount = 0;
  }
  
  if (restartCount >= MAX_RESTARTS) {
    log(`Too many restarts (${MAX_RESTARTS}) in ${RESTART_WINDOW_MS / 1000}s. Stopping.`);
    process.exit(1);
  }
  
  restartCount++;
  lastRestartTime = now;
  
  log(`Starting server (attempt ${restartCount}/${MAX_RESTARTS})...`);
  
  childProcess = spawn('npx', ['tsx', join(__dirname, 'index.ts')], {
    stdio: 'inherit',
    env: { ...process.env },
    shell: true,
  });
  
  childProcess.on('exit', (code, signal) => {
    if (signal === 'SIGTERM' || signal === 'SIGINT') {
      log('Server stopped by signal');
      process.exit(0);
    }
    
    if (code !== 0) {
      log(`Server crashed with code ${code}. Restarting in ${RESTART_DELAY_MS / 1000}s...`);
      setTimeout(startServer, RESTART_DELAY_MS);
    } else {
      log('Server exited normally');
      process.exit(0);
    }
  });
  
  childProcess.on('error', (err) => {
    log(`Failed to start server: ${err.message}`);
    setTimeout(startServer, RESTART_DELAY_MS);
  });
}

process.on('SIGTERM', () => {
  log('Received SIGTERM, stopping...');
  if (childProcess) {
    childProcess.kill('SIGTERM');
  }
});

process.on('SIGINT', () => {
  log('Received SIGINT, stopping...');
  if (childProcess) {
    childProcess.kill('SIGINT');
  }
});

startServer();
