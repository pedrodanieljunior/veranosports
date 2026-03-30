import express, { type Request, Response, NextFunction } from "express";
import path from "path";
import fs from "fs";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";

import { storage } from "./storage";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const uploadsDir = path.join(process.cwd(), "uploads", "banners");
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

  await storage.seedMarketSettings();

  // Migração de dados: arredondar odds e recalcular retornos em todas as apostas
  try {
    const { db } = await import("./db");
    const { sql } = await import("drizzle-orm");
    // 1. Arredondar odds individuais nas selections (JSONB)
    await db.execute(sql`
      UPDATE bet_slips
      SET selections = (
        SELECT jsonb_agg(
          sel || jsonb_build_object('odds', ROUND((sel->>'odds')::numeric, 2))
        )
        FROM jsonb_array_elements(selections) AS sel
      )
      WHERE EXISTS (
        SELECT 1 FROM jsonb_array_elements(selections) AS sel
        WHERE ABS(ROUND((sel->>'odds')::numeric, 2) - (sel->>'odds')::numeric) > 0.0001
      )
    `);
    // 2. Recalcular total_odds como produto das odds arredondadas
    await db.execute(sql`
      UPDATE bet_slips
      SET total_odds = ROUND(
        (SELECT EXP(SUM(LN(ROUND((sel->>'odds')::numeric, 2))))
         FROM jsonb_array_elements(selections) AS sel)
      ::numeric, 2)
    `);
    // 3. Recalcular potential_win = stake * total_odds (limitado ao cap)
    await db.execute(sql`
      UPDATE bet_slips
      SET potential_win = LEAST(
        ROUND((stake * total_odds)::numeric, 2),
        15000
      )
      WHERE ABS(ROUND((stake * total_odds)::numeric, 2) - potential_win::numeric) > 0.01
    `);
    log("[Migration] Odds e retornos arredondados com sucesso", "db");
  } catch (err) {
    log(`[Migration] Falha na migração de odds: ${err}`, "db");
  }

  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
      
      // Aquecer o cache imediatamente após o servidor iniciar
      // Isso garante que os dados estejam prontos antes dos usuários acessarem
      setTimeout(async () => {
        try {
          log("[Warmup] Aquecendo cache de jogos...", "cache");
          const res = await fetch(`http://localhost:${port}/api/games/today`);
          if (res.ok) {
            log("[Warmup] Cache de jogos/today carregado com sucesso", "cache");
          } else {
            log(`[Warmup] games/today retornou ${res.status}`, "cache");
          }
        } catch (err) {
          log(`[Warmup] Falha ao aquecer cache: ${err}`, "cache");
        }
      }, 500); // 500ms para o servidor estar pronto para receber requisições
    },
  );
})();
