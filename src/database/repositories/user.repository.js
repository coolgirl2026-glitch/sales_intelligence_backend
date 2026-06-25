import { requireSupabase } from "../supabase.client.js";

async function findUserByEmail(email) {
  const client = requireSupabase();
  let page = 1;

  while (true) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;

    const user = data?.users?.find((item) => item.email?.toLowerCase() === email.toLowerCase());
    if (user) return user;

    if (!data?.nextPage || data.nextPage === page) break;
    page = data.nextPage;
  }

  return null;
}

function generatePassword() {
  return `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}A1!`;
}

export async function resolveOrCreateUser(email, password) {
  const normalizedEmail = email?.trim().toLowerCase();
  if (!normalizedEmail) throw new Error("Email is required");

  const existingUser = await findUserByEmail(normalizedEmail);
  if (existingUser) return existingUser.id;

  const safePassword = password && password.length >= 6 ? password : generatePassword();
  const { data, error } = await requireSupabase().auth.admin.createUser({
    email: normalizedEmail,
    password: safePassword,
  });

  if (error) {
    const existingAfterError = await findUserByEmail(normalizedEmail);
    if (existingAfterError) return existingAfterError.id;
    throw error;
  }

  return data.user.id;
}

export async function createLoginAccount({
  name,
  email,
  passwordHash,
  role = "member",
  status = "pending",
  invitedBy = null,
  approvedBy = null,
}) {
  const client = requireSupabase();
  const payload = {
    name,
    email: email.toLowerCase(),
    password_hash: passwordHash,
    role,
    status,
    invited_by: invitedBy || null,
  };
  if (status === "active") {
    payload.approved_by = approvedBy || null;
    payload.approved_at = new Date().toISOString();
  }

  const { data, error } = await client
    .from("login")
    .insert(payload)
    .select("id, name, email, role, status, created_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw Object.assign(new Error("An account with this email already exists"), { status: 409 });
    }
    throw error;
  }
  return data;
}

export async function findLoginAccountByEmail(email) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("login")
    .select("*")
    .eq("email", email.toLowerCase())
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function findLoginAccountById(id) {
  if (!id) return null;
  const client = requireSupabase();
  const { data, error } = await client
    .from("login")
    .select("id, name, email, role, status, created_at, last_login_at")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function touchLoginLastSeen(id) {
  const client = requireSupabase();
  const { error } = await client
    .from("login")
    .update({ last_login_at: new Date().toISOString() })
    .eq("id", id);

  if (error) console.error("Failed to update last_login_at:", error.message);
}

export async function listLoginAccounts({ status } = {}) {
  const client = requireSupabase();
  let query = client
    .from("login")
    .select("id, name, email, role, status, invited_by, approved_by, approved_at, rejected_at, created_at, last_login_at");

  if (status) query = query.eq("status", status);

  const { data, error } = await query.order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

export async function updateLoginStatus(id, status, { approvedBy = null } = {}) {
  const client = requireSupabase();
  const payload = { status };
  if (status === "active") {
    payload.approved_by = approvedBy;
    payload.approved_at = new Date().toISOString();
    payload.rejected_at = null;
  } else if (status === "rejected") {
    payload.approved_by = approvedBy;
    payload.rejected_at = new Date().toISOString();
  }

  const { data, error } = await client
    .from("login")
    .update(payload)
    .eq("id", id)
    .select("id, name, email, role, status, created_at")
    .single();

  if (error) throw error;
  return data;
}

export async function updateLoginRole(id, role) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("login")
    .update({ role })
    .eq("id", id)
    .select("id, name, email, role, status, created_at")
    .single();

  if (error) throw error;
  return data;
}
