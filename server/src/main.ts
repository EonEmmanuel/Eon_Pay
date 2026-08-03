import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import helmet from "helmet";
import { AppModule } from "./app.module.js";
import { parseCorsOrigins, type Environment } from "./config/environment.js";

const app = await NestFactory.create(AppModule, {
  bufferLogs: true,
  rawBody: true,
});
const config = app.get(ConfigService<Environment, true>);
const origins = parseCorsOrigins(config.get("CORS_ORIGINS", { infer: true }));

app.use(
  helmet({
    contentSecurityPolicy: false,
  }),
);
app.enableCors({
  origin: origins,
  credentials: false,
  methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Authorization",
    "Content-Type",
    "Idempotency-Key",
    "X-Request-Id",
    "X-Tenant-Id",
  ],
  exposedHeaders: ["X-Request-Id"],
  maxAge: 600,
});
app.setGlobalPrefix("api/v1");
app.useGlobalPipes(
  new ValidationPipe({
    transform: true,
    transformOptions: { enableImplicitConversion: true },
    whitelist: true,
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
    stopAtFirstError: false,
  }),
);

if (config.get("TRUST_PROXY", { infer: true })) {
  app.getHttpAdapter().getInstance().set("trust proxy", 1);
}

if (config.get("API_DOCS_ENABLED", { infer: true })) {
  const swaggerConfig = new DocumentBuilder()
    .setTitle("Investor-Ready Financial API")
    .setDescription(
      "Tenant-isolated financing, servicing, payment, fee, and ledger API.",
    )
    .setVersion("1.0")
    .addBearerAuth()
    .addApiKey({ type: "apiKey", in: "header", name: "X-Tenant-Id" }, "tenant")
    .build();
  SwaggerModule.setup(
    "api/docs",
    app,
    SwaggerModule.createDocument(app, swaggerConfig),
  );
}

app.enableShutdownHooks();
await app.listen(config.get("PORT", { infer: true }), "0.0.0.0");
