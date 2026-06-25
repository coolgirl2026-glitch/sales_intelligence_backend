import { requireSupabase } from "../supabase.client.js";

export async function createInvite({ email = null, code, role = "member", createdBy, expiresAt = null }) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("invites")
    .insert({
      email: email ? email.toLowerCase() : null,
      code,
      role,
      created_by: createdBy || null,
      expires_at: expiresAt,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function findInviteByCode(code) {
  if (!code) return null;
  const client = requireSupabase();
  const { data, error } = await client
    .from("invites")
    .select("*")
    .eq("code", code.trim())
    .is("used_at", null)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function markInviteUsed(id, usedBy) {
  const client = requireSupabase();
  const { error } = await client
    .from("invites")
    .update({ used_at: new Date().toISOString(), used_by: usedBy })
    .eq("id", id);

  if (error) throw error;
}

export async function listInvites() {
  const client = requireSupabase();
  const { data, error } = await client
    .from("invites")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

export async function revokeInvite(id) {
  const client = requireSupabase();
  const { error } = await client
    .from("invites")
    .delete()
    .eq("id", id)
    .is("used_at", null);

  if (error) throw error;
}
