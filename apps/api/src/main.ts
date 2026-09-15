import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module.js";
import { ApiExceptionFilter } from "./common/http/api-exception.filter.js";
import { getEnv } from "./config/env.js";

const env = getEnv();
const app = await NestFactory.create(AppModule, { bufferLogs: true });
app.enableCors({ origin: env.WEB_ORIGIN, credentials: true });
app.enableShutdownHooks();
app.setGlobalPrefix("api/v1");
app.useGlobalFilters(new ApiExceptionFilter());

const openApiConfig = new DocumentBuilder()
  .setTitle("Dental SaaS API")
  .setDescription("Tenant-isolated API for the Dental SaaS platform")
  .setVersion("0.1.0")
  .addBearerAuth()
  .build();
SwaggerModule.setup("docs", app, SwaggerModule.createDocument(app, openApiConfig));

await app.listen(env.PORT, "0.0.0.0");
