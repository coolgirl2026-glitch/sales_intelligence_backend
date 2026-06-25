import "dotenv/config";

export const PORT = process.env.PORT || 3001;

export const JWT_SECRET = process.env.JWT_SECRET;
export const JWT_EXPIRES_IN = "30d";
export const SECRET_FOR_SIGNING = JWT_SECRET || "insecure-dev-secret-set-JWT_SECRET-in-env";

if (!JWT_SECRET) {
  console.warn(
    "⚠️  JWT_SECRET is not set in backend/.env — sessions will not be secure. " +
    "Generate one with: node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\""
  );
}

export const SUPABASE_URL = process.env.SUPABASE_URL;
export const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_SERVICE_KEY);

export const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
export const ANALYSIS_MODEL = process.env.OPENROUTER_ANALYSIS_MODEL || process.env.OPENROUTER_MODEL || "anthropic/claude-sonnet-4";
export const SEARCH_MODEL = process.env.OPENROUTER_SEARCH_MODEL || "perplexity/sonar";
export const ANALYSIS_MAX_TOKENS = Number(process.env.OPENROUTER_ANALYSIS_MAX_TOKENS || process.env.OPENROUTER_MAX_TOKENS || 1400);
export const SEARCH_MAX_TOKENS = Number(process.env.OPENROUTER_SEARCH_MAX_TOKENS || 800);
export const AUDIT_MODEL = process.env.OPENROUTER_AUDIT_MODEL || ANALYSIS_MODEL;

export const FRONTEND_URL = process.env.FRONTEND_URL;
export const MOCK_GENERATE = process.env.MOCK_GENERATE === "true";

export const isVercel = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
