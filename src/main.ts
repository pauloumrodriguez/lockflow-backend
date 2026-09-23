import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

/*
 * This is the application's entry point. It builds the NestJS application from
 * AppModule, selects the configured port, and exposes the server to local and
 * container traffic.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.PORT ?? 3000);

  await app.listen(port, "0.0.0.0");
}

void bootstrap();
