import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import type { Request } from "express";
import type { User } from "@ethio/db";
import { UsersService } from "../users/users.service";

/** After AuthGuard: only Telegram IDs listed in ADMIN_TELEGRAM_IDS. */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly users: UsersService) {}

  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest<Request & { user?: User }>().user;
    if (!user || !this.users.isAdmin(user)) throw new ForbiddenException("Admins only");
    return true;
  }
}
