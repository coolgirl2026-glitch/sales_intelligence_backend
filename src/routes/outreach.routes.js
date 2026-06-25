import { Router } from "express";
import { save, sent, listOutreach } from "../controllers/outreach.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = Router();

// Prefix: /api/outreach
router.post("/save", requireAuth(), save);
router.patch("/:id/sent", requireAuth(), sent);
router.get("/", requireAuth(), listOutreach);

export default router;
