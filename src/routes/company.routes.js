import { Router } from "express";
import { getCompanies } from "../controllers/company.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = Router();

// Prefix: /api/companies
router.get("/", requireAuth(), getCompanies);

export default router;
