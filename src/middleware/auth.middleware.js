import { verifyToken } from "../services/auth/jwt.service.js";
import { findLoginAccountById } from "../database/repositories/user.repository.js";

export function requireAuth({ allowPending = false } = {}) {
  return async function (req, res, next) {
    const header = req.headers["authorization"] || "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : null;

    if (!token) {
      return res.status(401).json({ error: "Missing session. Please sign in." });
    }

    try {
      const payload = verifyToken(token);
      const account = await findLoginAccountById(payload.sub);

      if (!account) {
        return res.status(401).json({ error: "Account no longer exists. Please sign in again." });
      }

      req.user = {
        id: account.id,
        name: account.name,
        email: account.email,
        role: account.role,
        status: account.status,
      };

      if (!allowPending && account.status !== "active") {
        return res.status(403).json({
          error:
            account.status === "rejected"
              ? "Your access request was declined. Contact your admin if you think this is a mistake."
              : "Your account is pending admin approval. You'll get access as soon as an admin approves your request.",
          status: account.status,
        });
      }

      return next();
    } catch (err) {
      return res.status(401).json({ error: "Session expired or invalid. Please sign in again." });
    }
  };
}
