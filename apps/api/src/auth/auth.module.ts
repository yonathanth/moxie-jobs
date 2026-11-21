import { Global, Module } from "@nestjs/common";
import { UsersModule } from "../users/users.module";
import { AuthController } from "./auth.controller";
import { AuthGuard } from "./auth.guard";
import { TokenService } from "./token.service";

@Global()
@Module({
  imports: [UsersModule],
  controllers: [AuthController],
  providers: [TokenService, AuthGuard],
  exports: [TokenService, AuthGuard],
})
export class AuthModule {}
