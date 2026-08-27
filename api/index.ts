import "dotenv/config";
import express, { type Response, type NextFunction } from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "../server/_core/oauth";
import { registerStorageProxy } from "../server/_core/storageProxy";
import { createContext } from "../server/_core/context";
import { appRouter } from "../server/routers";

/**
 * Vercel Function entrypoint. Static frontend files are served by Vercel from
 * dist/public; this function handles OAuth, storage proxying, and tRPC routes.
 */
const app = express();
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

registerStorageProxy(app);
registerOAuthRoutes(app);

const trpcMiddleware = createExpressMiddleware({
  router: appRouter,
  createContext,
});

// Support both /api/trpc and /trpc in case of Vercel path rewrites
app.use("/api/trpc", trpcMiddleware);
app.use("/trpc", trpcMiddleware);

// JSON error handler to prevent HTML/text error pages from breaking tRPC JSON parser
app.use((err: any, _req: unknown, res: Response, _next: NextFunction) => {
  console.error("[Server Error]", err);
  if (!res.headersSent) {
    res.status(500).json({
      error: {
        message: err?.message || "Internal server error",
        code: "INTERNAL_SERVER_ERROR",
      },
    });
  }
});

export default app;

