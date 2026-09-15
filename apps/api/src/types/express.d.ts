import type { AuthContext } from "../modules/identity/auth-context.js";

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      auth?: AuthContext;
    }
  }
}

export {};
