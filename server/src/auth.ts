import type { NextFunction, Request, Response } from "express";
import type { Config } from "./config.js";

export type AuthUser = {
  id: string;
  email?: string;
};

export interface AuthVerifier {
  verifyAccessToken(accessToken: string): Promise<AuthUser | null>;
}

export class SupabaseAuthVerifier implements AuthVerifier {
  constructor(
    private readonly supabaseUrl: string,
    private readonly publishableKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs = 8000,
  ) {}

  async verifyAccessToken(accessToken: string): Promise<AuthUser | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(`${this.supabaseUrl.replace(/\/$/, "")}/auth/v1/user`, {
        headers: {
          apikey: this.publishableKey,
          Authorization: `Bearer ${accessToken}`,
        },
        signal: controller.signal,
      });

      if (response.status === 401 || response.status === 403) return null;
      if (!response.ok) {
        throw new Error(`Supabase Auth validation failed with ${response.status}`);
      }

      const payload = (await response.json()) as { id?: unknown; email?: unknown };
      if (typeof payload.id !== "string" || !payload.id.trim()) return null;

      return {
        id: payload.id,
        email: typeof payload.email === "string" ? payload.email : undefined,
      };
    } catch (error) {
      if ((error as { name?: string })?.name === "AbortError") {
        throw new Error("Supabase Auth validation timed out");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export const createAuthVerifier = (config: Config): AuthVerifier | null => {
  if (!config.supabaseUrl || !config.supabasePublishableKey) return null;
  return new SupabaseAuthVerifier(config.supabaseUrl, config.supabasePublishableKey);
};

export const requireApiAuth =
  (config: Config, verifier: AuthVerifier | null) =>
  async (req: Request, res: Response, next: NextFunction) => {
    if (!config.authRequired) {
      next();
      return;
    }

    if (!verifier || config.allowedUserIds.length === 0) {
      res.status(503).json({
        error: "AUTH_NOT_CONFIGURED",
        message: "Private access is required, but backend authentication is not fully configured.",
      });
      return;
    }

    const accessToken = readBearerToken(req.headers.authorization);
    if (!accessToken) {
      res.setHeader("WWW-Authenticate", "Bearer");
      res.status(401).json({ error: "AUTH_REQUIRED", message: "Sign in to access EdgeLab." });
      return;
    }

    try {
      const user = await verifier.verifyAccessToken(accessToken);
      if (!user) {
        res.setHeader("WWW-Authenticate", 'Bearer error="invalid_token"');
        res.status(401).json({ error: "INVALID_SESSION", message: "Your session is invalid or expired." });
        return;
      }

      if (!config.allowedUserIds.includes(user.id)) {
        res.status(403).json({ error: "ACCESS_DENIED", message: "This account is not authorized for EdgeLab." });
        return;
      }

      res.locals.authUser = user;
      next();
    } catch {
      res.status(503).json({
        error: "AUTH_UNAVAILABLE",
        message: "Session verification is temporarily unavailable. No API action was performed.",
      });
    }
  };

const readBearerToken = (authorization: string | undefined) => {
  if (!authorization) return null;
  const match = authorization.match(/^Bearer ([^\s]+)$/i);
  return match?.[1] || null;
};
