import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import {
  createLoginAccount,
  findLoginAccountByEmail,
  touchLoginLastSeen,
  resolveOrCreateUser,
  listLoginAccounts,
  updateLoginRole,
  updateLoginStatus,
} from "../../database/repositories/user.repository.js";
import {
  findInviteByCode,
  markInviteUsed,
  listInvites,
  createInvite,
  revokeInvite,
} from "../../database/repositories/invite.repository.js";
import { signToken } from "./jwt.service.js";

export async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

let cachedSharedUserUuid = null;
export async function getSharedWorkspaceUserId() {
  if (cachedSharedUserUuid) return cachedSharedUserUuid;
  cachedSharedUserUuid = await resolveOrCreateUser("sales-team@example.com", "Sales@123");
  return cachedSharedUserUuid;
}

export async function registerUser({ name, email, password, inviteCode }) {
  if (!name?.trim() || !email?.trim() || !password) {
    throw Object.assign(new Error("Name, email and password are required"), { status: 400 });
  }
  if (password.length < 6) {
    throw Object.assign(new Error("Password must be at least 6 characters"), { status: 400 });
  }

  const normalizedEmail = email.trim();
  const existing = await findLoginAccountByEmail(normalizedEmail);
  if (existing) {
    throw Object.assign(new Error("An account with this email already exists. Try signing in."), { status: 409 });
  }

  let role = "member";
  let status = "pending";
  let invitedBy = null;
  let invite = null;

  if (inviteCode?.trim()) {
    invite = await findInviteByCode(inviteCode.trim());
    if (!invite) {
      throw Object.assign(new Error("That invite code is invalid, expired, or already used."), { status: 400 });
    }
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      throw Object.assign(new Error("That invite code has expired. Ask your admin for a new one."), { status: 400 });
    }
    if (invite.email && invite.email.toLowerCase() !== normalizedEmail.toLowerCase()) {
      throw Object.assign(new Error("This invite code was issued for a different email address."), { status: 400 });
    }
    role = invite.role || "member";
    status = "active";
    invitedBy = invite.created_by || null;
  }

  const passwordHash = await hashPassword(password);
  const account = await createLoginAccount({
    name: name.trim(),
    email: normalizedEmail,
    passwordHash,
    role,
    status,
    invitedBy,
  });

  if (invite) {
    await markInviteUsed(invite.id, account.id);
  }

  const token = signToken(account);
  return {
    token,
    user: { id: account.id, name: account.name, email: account.email, role: account.role, status: account.status },
  };
}

export async function authenticateUser({ email, password }) {
  if (!email?.trim() || !password) {
    throw Object.assign(new Error("Email and password are required"), { status: 400 });
  }

  const account = await findLoginAccountByEmail(email.trim());
  if (!account) {
    throw Object.assign(new Error("Invalid email or password"), { status: 401 });
  }

  const valid = await comparePassword(password, account.password_hash);
  if (!valid) {
    throw Object.assign(new Error("Invalid email or password"), { status: 401 });
  }

  await touchLoginLastSeen(account.id);

  const token = signToken(account);
  return {
    token,
    user: { id: account.id, name: account.name, email: account.email, role: account.role, status: account.status },
  };
}

// Admin / Membership functions
export async function getMembers() {
  return listLoginAccounts({ status: "active" });
}

export async function getPendingRequests() {
  return listLoginAccounts({ status: "pending" });
}

export async function approveRequest(id, role, adminId) {
  const selectedRole = role === "admin" ? "admin" : "member";
  await updateLoginRole(id, selectedRole);
  return updateLoginStatus(id, "active", { approvedBy: adminId });
}

export async function rejectRequest(id, adminId) {
  return updateLoginStatus(id, "rejected", { approvedBy: adminId });
}

export async function updateUserRole(id, role, adminId) {
  if (role !== "admin" && role !== "member") {
    throw Object.assign(new Error("role must be 'admin' or 'member'"), { status: 400 });
  }
  if (id === adminId && role === "member") {
    throw Object.assign(new Error("You can't demote yourself. Ask another admin to do it."), { status: 400 });
  }
  return updateLoginRole(id, role);
}

export async function revokeUserAccess(id, adminId) {
  if (id === adminId) {
    throw Object.assign(new Error("You can't revoke your own access."), { status: 400 });
  }
  return updateLoginStatus(id, "rejected", { approvedBy: adminId });
}

export async function createAdminUser({ name, email, password, role }, adminId) {
  if (!name?.trim() || !email?.trim() || !password) {
    throw Object.assign(new Error("Name, email and password are required"), { status: 400 });
  }
  if (password.length < 6) {
    throw Object.assign(new Error("Password must be at least 6 characters"), { status: 400 });
  }

  const normalizedEmail = email.trim();
  const existing = await findLoginAccountByEmail(normalizedEmail);
  if (existing) {
    throw Object.assign(new Error("An account with this email already exists."), { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  return createLoginAccount({
    name: name.trim(),
    email: normalizedEmail,
    passwordHash,
    role: role === "admin" ? "admin" : "member",
    status: "active",
    approvedBy: adminId,
  });
}

export async function fetchInvites() {
  return listInvites();
}

export async function createNewInvite({ email, role, expiresInDays }, adminId) {
  const code = randomBytes(9).toString("hex");
  const expiresAt = expiresInDays ? new Date(Date.now() + Number(expiresInDays) * 86400000).toISOString() : null;

  return createInvite({
    email: email?.trim() || null,
    code,
    role: role === "admin" ? "admin" : "member",
    createdBy: adminId,
    expiresAt,
  });
}

export async function deleteInvite(id) {
  return revokeInvite(id);
}
