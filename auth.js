import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { findLoginAccountById } from "./supabase.js";

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = "30d"; // long-lived session = "continuous authentication"

if (!JWT_SECRET) {
  console.warn(
    "⚠️  JWT_SECRET is not set in backend/.env — sessions will not be secure. " +
    "Generate one with: node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\""
  );
}

const SECRET_FOR_SIGNING = JWT_SECRET || "insecure-dev-secret-set-JWT_SECRET-in-env";

export async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

export function signToken(account) {
  return jwt.sign(
    { sub: account.id, name: account.name, email: account.email },
    SECRET_FOR_SIGNING,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

export function verifyToken(token) {
  return jwt.verify(token, SECRET_FOR_SIGNING);
}

// Express middleware factory: requires a valid "Authorization: Bearer <token>"
// header AND re-loads the account's current role/status from the database on
// every request — we deliberately do NOT trust role/status from the JWT
// itself, since an admin can approve/reject/promote someone at any time and
// that change must take effect immediately, not just on next login.
//
// On success, attaches req.user = { id, name, email, role, status } and
// calls next().
//
// Pass { allowPending: true } for routes that pending/rejected accounts must
// still be able to reach (right now, only GET /api/auth/me — so the frontend
// can show a "your request is pending" / "your request was declined" screen
// instead of just failing silently).
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

// Express middleware: requires req.user.role === "admin". Must run AFTER
// requireAuth() so req.user is populated.
export function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Admin access required." });
  }
  return next();
}
