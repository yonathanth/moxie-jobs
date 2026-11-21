import { Global, Module } from "@nestjs/common";
import { loadEnv, type Env } from "./env";

export const ENV = Symbol("ENV");
export type { Env };

@Global()
@Module({
  providers: [{ provide: ENV, useFactory: () => loadEnv() }],
  exports: [ENV],
})
export class ConfigModule {}
