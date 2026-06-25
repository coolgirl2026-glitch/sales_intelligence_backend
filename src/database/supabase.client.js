import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { SUPABASE_URL, SUPABASE_SERVICE_KEY, isSupabaseConfigured } from "../config/env.js";

const supabase = isSupabaseConfigured ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY) : null;

export function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase is not configured. Add SUPABASE_URL and SUPABASE_SERVICE_KEY to backend .env.");
  }
  return supabase;
}

const LOCAL_DB_PATH = path.join(process.cwd(), "local_db.json");

export function readLocalDb() {
  try {
    if (fs.existsSync(LOCAL_DB_PATH)) {
      return JSON.parse(fs.readFileSync(LOCAL_DB_PATH, "utf8"));
    }
  } catch (err) {
    console.error("Failed to read local DB file:", err);
  }
  return { companies: [], analyses: [] };
}

export function writeLocalDb(data) {
  try {
    fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.error("Failed to write local DB file:", err);
  }
}

export { isSupabaseConfigured };
