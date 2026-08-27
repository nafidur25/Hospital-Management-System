import express from "express";
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
app.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }));

export default app;
