import { NestFactory } from "@nestjs/core";
import { ValidationPipe, Logger } from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { ConfigService } from "@nestjs/config";
import helmet from "helmet";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ["error", "warn", "log", "debug", "verbose"],
  });

  const config = app.get(ConfigService);
  const port = config.get<number>("PORT", 3001);
  const apiPrefix = config.get<string>("API_PREFIX", "api/v1");

  // Security
  app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false, // Off in dev; tune for prod
  }));

  // CORS — env-driven allowlist.
  //
  // CORS_ORIGIN is a comma-separated list of allowed Origin headers, e.g.
  //   CORS_ORIGIN=https://app.xovenmart.com,https://admin.xovenmart.com
  //
  // When unset (e.g. local dev) we fall back to a permissive allowlist so
  // localhost development still works. In production, the VPS .env always
  // sets CORS_ORIGIN to the real public domains.
  const allowedOrigins = (process.env.CORS_ORIGIN ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const devFallback = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
  ];
  const allowed = allowedOrigins.length > 0 ? allowedOrigins : devFallback;

  app.enableCors({
    origin: (origin, cb) => {
      // Same-origin / curl / server-to-server have no Origin header — allow.
      if (!origin) return cb(null, true);
      if (allowed.includes(origin)) return cb(null, true);
      // In production, refuse. In dev, also refuse but log a hint.
      // Returning `cb(null, false)` is the CORS-correct way to say
      // "this origin is not on the allowlist" — NestJS / Express will
      // then drop the request without sending ACAO headers, and the
      // browser will surface a real "blocked by CORS" error. The
      // previous implementation returned `cb(new Error(...))` which
      // NestJS converted into a 500 Internal Server Error, masking
      // the real problem and confusing log scanners / probes.
      // eslint-disable-next-line no-console
      console.warn(`[cors] blocked origin: ${origin}`);
      return cb(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    maxAge: 86400, // cache preflight 24h
  });

  // Global validation
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  }));

  // Global prefix
  app.setGlobalPrefix(apiPrefix);

  // OpenAPI / Swagger
  const swaggerConfig = new DocumentBuilder()
    .setTitle("XovenMart API")
    .setDescription("Single-vendor e-commerce API for XovenMart (Mudaforgonj, Laksam, Cumilla, Bangladesh)")
    .setVersion("0.1.0")
    .addBearerAuth(
      { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      "Customer",
    )
    .addBearerAuth(
      { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      "Admin",
    )
    .addBearerAuth(
      { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      "Rider",
    )
    .addTag("auth", "Phone OTP + JWT authentication")
    .addTag("catalog", "Categories, products, search")
    .addTag("cart", "Shopping cart")
    .addTag("checkout", "Order placement")
    .addTag("orders", "Order tracking and history")
    .addTag("referrals", "Referral program")
    .addTag("coupons", "Promo code application")
    .addTag("admin", "Admin management APIs")
    .addTag("rider", "Rider delivery APIs")
    .addTag("health", "Health checks")
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("docs", app, document);

  await app.listen(port, "0.0.0.0");
  Logger.log(`🚀 XovenMart API listening on http://0.0.0.0:${port}/${apiPrefix}`, "Bootstrap");
  Logger.log(`📘 OpenAPI docs at http://0.0.0.0:${port}/docs`, "Bootstrap");
}

bootstrap();
