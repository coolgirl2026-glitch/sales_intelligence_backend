import { Router } from "express";
import { generate } from "../controllers/analysis.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = Router();

// Prefix: /api/generate
router.post("/", requireAuth(), generate);

export default router;
