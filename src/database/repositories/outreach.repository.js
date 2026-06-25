import { requireSupabase } from "../supabase.client.js";

export async function saveOutreachMessage(userId, { analysisId, companyId, channel, subject, content }) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("outreach_saves")
    .insert({
      user_id: userId,
      analysis_id: analysisId || null,
      company_id: companyId || null,
      channel,
      subject: subject || null,
      content,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function markOutreachSent(outreachId, userId) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("outreach_saves")
    .update({ was_sent: true, sent_at: new Date().toISOString() })
    .eq("id", outreachId)
    .eq("user_id", userId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getUserOutreach(userId) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("outreach_saves")
    .select(`
      *,
      companies ( name )
    `)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}
