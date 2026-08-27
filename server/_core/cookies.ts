import type { IncomingHttpHeaders } from "node:http";

/** Minimal request shape so this compiles without relying on Express's Request type. */
export type CookieRequest = {
  protocol?: string;
  headers?: IncomingHttpHeaders;
};

export type SessionCookieOptions = {
  httpOnly: boolean;
  path: string;
  sameSite: "lax" | "none" | "strict";
  secure: boolean;
  domain?: string;
};

function isSecureRequest(req: CookieRequest): boolean {
  if (req.protocol === "https") return true;

  const forwardedProto = req.headers?.["x-forwarded-proto"];
  if (!forwardedProto) return false;

  const protoList: string[] = Array.isArray(forwardedProto)
    ? forwardedProto
    : typeof forwardedProto === "string"
      ? forwardedProto.split(",")
      : [];

  return protoList.some((proto: string) => proto.trim().toLowerCase() === "https");
}

export function getSessionCookieOptions(req: CookieRequest): SessionCookieOptions {
  const secure = isSecureRequest(req);
  return {
    httpOnly: true,
    path: "/",
    sameSite: secure ? "none" : "lax",
    secure,
  };
}
