import { requireSupabase, readLocalDb, writeLocalDb, isSupabaseConfigured } from "../supabase.client.js";

export async function upsertCompany(userId, values) {
  const companyName = values.company?.trim();
  if (!companyName) return null;

  if (isSupabaseConfigured) {
    try {
      const client = requireSupabase();
      const { data: existing } = await client
        .from("companies")
        .select("id")
        .eq("user_id", userId)
        .ilike("name", companyName)
        .maybeSingle();

      const payload = {
        user_id: userId,
        name: companyName,
        website: values.website || null,
        industry: values.industry || null,
        size: values.size || null,
        location: values.location || null,
        contact_role: values.persona || null,
        known_pain: values.pain || values.challenge || values.context || null,
      };

      if (existing?.id) {
        const { data, error } = await client
          .from("companies")
          .update(payload)
          .eq("id", existing.id)
          .select()
          .single();

        if (error) throw error;
        return data;
      }

      const { data, error } = await client
        .from("companies")
        .insert(payload)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (supabaseErr) {
      console.error("Supabase upsertCompany error, falling back to local storage:", supabaseErr.message);
    }
  }

  // Fallback to local JSON DB
  const db = readLocalDb();
  let existing = db.companies.find(
    (c) => c.user_id === userId && c.name.toLowerCase() === companyName.toLowerCase()
  );
  if (existing) {
    existing.website = values.website || existing.website || null;
    existing.industry = values.industry || existing.industry || null;
    existing.size = values.size || existing.size || null;
    existing.location = values.location || existing.location || null;
    existing.contact_role = values.persona || existing.contact_role || null;
    existing.known_pain = values.pain || values.challenge || values.context || existing.known_pain || null;
    existing.updated_at = new Date().toISOString();
  } else {
    existing = {
      id: `local-co-${Math.random().toString(36).substring(2, 9)}`,
      user_id: userId,
      name: companyName,
      website: values.website || null,
      industry: values.industry || null,
      size: values.size || null,
      location: values.location || null,
      contact_role: values.persona || null,
      known_pain: values.pain || values.challenge || values.context || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    db.companies.push(existing);
  }
  writeLocalDb(db);
  return existing;
}

export async function getUserCompanies(userId) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("companies")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return data;
}
