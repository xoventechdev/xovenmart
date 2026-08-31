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
  // touch: auto-deploy smoke test 2026-08-31

  const config = app.get(ConfigService);
  const port = config.get<number>("PORT", 3001);
  const apiPrefix = config.get<string>("API_PREFIX", "api/v1");

  // Security
  app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false, // Off in dev; tune for prod
  }));

  // CORS — allow Next.js web + future app origins
  app.enableCors({
    origin: (origin, cb) => cb(null, true), // Whitelist via env in production
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
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
