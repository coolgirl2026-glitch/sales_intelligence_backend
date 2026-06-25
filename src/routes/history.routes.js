import { Router } from "express";
import {
  getHistory,
  getHistoryItem,
  toggleStar,
  deleteHistoryItem,
  touchHistoryItem,
} from "../controllers/history.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = Router();

// Prefix: /api/history (or mapped in main.js)
router.get("/", requireAuth(), getHistory);
router.get("/:id", requireAuth(), getHistoryItem);
router.patch("/:id/star", requireAuth(), toggleStar);
router.delete("/:id", requireAuth(), deleteHistoryItem);
router.patch("/:id/touch", requireAuth(), touchHistoryItem);

export default router;
