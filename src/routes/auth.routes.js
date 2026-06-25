import { Router } from "express";
import { signup, login, me, listMembers } from "../controllers/auth.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = Router();

// Prefix: /api/auth
router.post("/signup", signup);
router.post("/login", login);
router.get("/me", requireAuth({ allowPending: true }), me);

// Also handle /api/members (can map directly in main.js or route here)
// Let's keep it clean: if main.js routes /api/auth to this router,
// we can also map /api/members directly to listMembers in main.js,
// or we can route both here. Let's export router and listMembers separately or handle it.
// We'll export the router for /api/auth
export default router;

export const membersRouter = Router();
membersRouter.get("/", requireAuth(), listMembers);
