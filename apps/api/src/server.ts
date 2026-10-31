import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { authenticate, tenantContext } from "./middleware/auth.js";
import routes from "./routes.js";

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: process.env.APP_ORIGIN
      ? process.env.APP_ORIGIN.split(",").map((s) => s.trim())
      : true,
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_q, r) =>
  r.json({ status: "ok", service: "Nexus Shared SaaS API" })
);

app.use("/api", authenticate, routes);
app.use("/api/tenant", authenticate, tenantContext, routes);

app.use(
  (
    e: any,
    _q: express.Request,
    r: express.Response,
    _n: express.NextFunction
  ) => {
    console.error(e);
    r.status(500).json({ error: "Internal server error" });
  }
);

const port = Number(process.env.PORT || 4000);
app.listen(port, "0.0.0.0", () =>
  console.log(`Nexus Shared SaaS API started on port ${port}`)
);
