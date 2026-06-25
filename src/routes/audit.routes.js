import { Router } from "express";
import { auditGeneration } from "../controllers/audit.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = Router();

// Prefix: /api/audit-generation (or mapped in main.js)
router.post("/", requireAuth(), auditGeneration);

export default router;
