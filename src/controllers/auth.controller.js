import { registerUser, authenticateUser, getMembers } from "../services/auth/auth.service.js";
import { isSupabaseConfigured } from "../database/supabase.client.js";

function checkSupabase(res) {
  if (!isSupabaseConfigured) {
    res.status(500).json({ error: "Supabase is not configured. This feature is unavailable." });
    return false;
  }
  return true;
}

export async function signup(req, res, next) {
  if (!checkSupabase(res)) return;
  try {
    const { name, email, password, inviteCode } = req.body || {};
    const result = await registerUser({ name, email, password, inviteCode });
    return res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

export async function login(req, res, next) {
  if (!checkSupabase(res)) return;
  try {
    const { email, password } = req.body || {};
    const result = await authenticateUser({ email, password });
    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function me(req, res) {
  return res.status(200).json({ user: req.user });
}

export async function listMembers(req, res, next) {
  if (!checkSupabase(res)) return;
  try {
    const members = await getMembers();
    return res.status(200).json({ members });
  } catch (err) {
    next(err);
  }
}
