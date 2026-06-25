import jwt from "jsonwebtoken";
import { SECRET_FOR_SIGNING, JWT_EXPIRES_IN } from "../../config/env.js";

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
