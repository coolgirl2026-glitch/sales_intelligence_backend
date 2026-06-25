import { FRONTEND_URL } from "./env.js";

export const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, or server-to-server)
    if (!origin) return callback(null, true);

    const allowedOrigins = [
      "http://localhost:5173",
      "http://localhost:5174",
      "http://localhost:5175",
      "http://localhost:5176",
      "http://localhost:4173",
      "null",
      FRONTEND_URL,
    ].filter(Boolean);

    const isAllowed = allowedOrigins.includes(origin) ||
                      origin.startsWith("http://localhost:") ||
                      origin.endsWith(".vercel.app");

    if (isAllowed) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods: ["POST", "GET", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "user-id", "Authorization"],
};
