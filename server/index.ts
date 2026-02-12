import express, { type Request, Response, NextFunction } from "express";
import dotenv from "dotenv";
import path from "path";

// Load environment variables from .env file
dotenv.config();

import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { initTelegramBot } from "./telegram-bot";
import { initScheduler } from "./scheduler";

// Track server start time for health checks
const serverStartTime = Date.now();
let isShuttingDown = false;

// Graceful shutdown handler
function gracefulShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  
  console.log(`\n[Process] Received ${signal}, shutting down gracefully...`);
  
  httpServer.close(() => {
    console.log('[Process] HTTP server closed');
    process.exit(0);
  });
  
  // Force exit after 10 seconds
  setTimeout(() => {
    console.error('[Process] Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

// Handle uncaught exceptions - log and continue if possible
process.on('uncaughtException', (error: Error) => {
  console.error('[Process] Uncaught Exception:', error.message);
  console.error(error.stack);
  // Don't exit - let the process continue running
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  console.error('[Process] Unhandled Rejection at:', promise);
  console.error('[Process] Reason:', reason);
  // Don't exit - let the process continue running
});

// Handle termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  // Health check endpoint for monitoring
  app.get('/api/health', (_req: Request, res: Response) => {
    const uptime = Math.floor((Date.now() - serverStartTime) / 1000);
    res.json({
      status: 'ok',
      uptime: uptime,
      timestamp: new Date().toISOString(),
      memory: process.memoryUsage(),
    });
  });

  // Global error handler - catches errors without crashing
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error(`[Error Handler] ${status}: ${message}`);
    if (err.stack) {
      console.error(err.stack);
    }

    res.status(status).json({ message });
    // Don't re-throw - this would crash the server
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    async () => {
      log(`serving on port ${port}`);
      
      // Initialize Telegram bot with webhook
      try {
        await initTelegramBot();
      } catch (error) {
        console.error("[Telegram Bot] Failed to initialize:", error);
      }
      
      // Initialize scheduler for automatic shift closure at 23:00
      initScheduler();
    },
  );
})();
