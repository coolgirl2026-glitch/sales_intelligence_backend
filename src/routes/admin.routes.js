import { Router } from "express";
import {
  listPendingRequests,
  approve,
  reject,
  updateRole,
  revokeAccess,
  createUser,
  listInvites,
  createInvite,
  revokeInvite,
} from "../controllers/admin.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requireAdmin } from "../middleware/admin.middleware.js";

const router = Router();

// Prefix: /api/admin (or handled in main.js)
router.get("/requests", requireAuth(), requireAdmin, listPendingRequests);
router.patch("/requests/:id/approve", requireAuth(), requireAdmin, approve);
router.patch("/requests/:id/reject", requireAuth(), requireAdmin, reject);
router.patch("/users/:id/role", requireAuth(), requireAdmin, updateRole);
router.patch("/users/:id/revoke", requireAuth(), requireAdmin, revokeAccess);
router.post("/users", requireAuth(), requireAdmin, createUser);
router.get("/invites", requireAuth(), requireAdmin, listInvites);
router.post("/invites", requireAuth(), requireAdmin, createInvite);
router.delete("/invites/:id", requireAuth(), requireAdmin, revokeInvite);

export default router;
