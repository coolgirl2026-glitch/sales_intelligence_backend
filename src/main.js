import express from "express";
import cors from "cors";
import { PORT } from "./config/env.js";
import { corsOptions } from "./config/cors.js";
import { isSupabaseConfigured } from "./database/supabase.client.js";

// Import Routers
import authRouter, { membersRouter } from "./routes/auth.routes.js";
import adminRouter from "./routes/admin.routes.js";
import analysisRouter from "./routes/analysis.routes.js";
import auditRouter from "./routes/audit.routes.js";
import historyRouter from "./routes/history.routes.js";
import companyRouter from "./routes/company.routes.js";
import outreachRouter from "./routes/outreach.routes.js";

// Import Middleware
import { errorHandler } from "./middleware/error.middleware.js";

const app = express();

app.use(express.json());
app.use(cors(corsOptions));

// Health Checks
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    message: "Sales Intelligence Backend Running",
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    message: "Sales Copilot backend is running",
    supabaseConfigured: isSupabaseConfigured,
  });
});

// Map Routes
app.use("/api/auth", authRouter);
app.use("/api/members", membersRouter);
app.use("/api/admin", adminRouter);
app.use("/api/generate", analysisRouter);
app.use("/api/audit-generation", auditRouter);
app.use("/api/history", historyRouter);
app.use("/api/companies", companyRouter);
app.use("/api/outreach", outreachRouter);

// Global Error Handler
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`\n✅ Sales Copilot backend running on http://localhost:${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/health`);
  console.log(`   Generate API: http://localhost:${PORT}/api/generate\n`);
});
