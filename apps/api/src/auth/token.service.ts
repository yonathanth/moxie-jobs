import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import jwt from "jsonwebtoken";
import { ENV, type Env } from "../config/config.module";

interface AccessTokenPayload {
  sub: string;
  typ: "access";
}

@Injectable()
export class TokenService {
  constructor(@Inject(ENV) private readonly env: Env) {}

  sign(userId: string): { accessToken: string; expiresIn: number } {
    const expiresIn = this.env.JWT_TTL_SECONDS;
    const payload: AccessTokenPayload = { sub: userId, typ: "access" };
    const accessToken = jwt.sign(payload, this.env.JWT_SECRET, { algorithm: "HS256", expiresIn });
    return { accessToken, expiresIn };
  }

  /** Returns the user id, or throws 401. */
  verify(token: string): string {
    try {
      const payload = jwt.verify(token, this.env.JWT_SECRET, { algorithms: ["HS256"] });
      if (typeof payload === "object" && payload.typ === "access" && typeof payload.sub === "string") {
        return payload.sub;
      }
    } catch {
      // fall through
    }
    throw new UnauthorizedException("Invalid or expired session");
  }
}
