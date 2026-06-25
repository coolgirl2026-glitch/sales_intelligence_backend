import {
  getPendingRequests,
  approveRequest,
  rejectRequest,
  updateUserRole,
  revokeUserAccess,
  createAdminUser,
  fetchInvites,
  createNewInvite,
  deleteInvite,
} from "../services/auth/auth.service.js";
import { isSupabaseConfigured } from "../database/supabase.client.js";

function checkSupabase(res) {
  if (!isSupabaseConfigured) {
    res.status(500).json({ error: "Supabase is not configured. This feature is unavailable." });
    return false;
  }
  return true;
}

export async function listPendingRequests(req, res, next) {
  if (!checkSupabase(res)) return;
  try {
    const requests = await getPendingRequests();
    return res.status(200).json({ requests });
  } catch (err) {
    next(err);
  }
}

export async function approve(req, res, next) {
  if (!checkSupabase(res)) return;
  try {
    const role = req.body?.role === "admin" ? "admin" : "member";
    const updated = await approveRequest(req.params.id, role, req.user.id);
    return res.status(200).json({ account: updated });
  } catch (err) {
    next(err);
  }
}

export async function reject(req, res, next) {
  if (!checkSupabase(res)) return;
  try {
    const updated = await rejectRequest(req.params.id, req.user.id);
    return res.status(200).json({ account: updated });
  } catch (err) {
    next(err);
  }
}

export async function updateRole(req, res, next) {
  if (!checkSupabase(res)) return;
  try {
    const role = req.body?.role;
    const updated = await updateUserRole(req.params.id, role, req.user.id);
    return res.status(200).json({ account: updated });
  } catch (err) {
    next(err);
  }
}

export async function revokeAccess(req, res, next) {
  if (!checkSupabase(res)) return;
  try {
    const updated = await revokeUserAccess(req.params.id, req.user.id);
    return res.status(200).json({ account: updated });
  } catch (err) {
    next(err);
  }
}

export async function createUser(req, res, next) {
  if (!checkSupabase(res)) return;
  try {
    const account = await createAdminUser(req.body || {}, req.user.id);
    return res.status(201).json({ account });
  } catch (err) {
    next(err);
  }
}

export async function listInvites(req, res, next) {
  if (!checkSupabase(res)) return;
  try {
    const invites = await fetchInvites();
    return res.status(200).json({ invites });
  } catch (err) {
    next(err);
  }
}

export async function createInvite(req, res, next) {
  if (!checkSupabase(res)) return;
  try {
    const { email, role, expiresInDays } = req.body || {};
    const invite = await createNewInvite({ email, role, expiresInDays }, req.user.id);
    return res.status(201).json({ invite });
  } catch (err) {
    next(err);
  }
}

export async function revokeInvite(req, res, next) {
  if (!checkSupabase(res)) return;
  try {
    await deleteInvite(req.params.id);
    return res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
}
