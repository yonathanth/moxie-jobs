import { PrismaClient } from "@ethio/db";
import { env } from "./env";

// Loads .env (DATABASE_URL) before Prisma reads it, for scripts that never touch env() themselves.
env();

export const prisma = new PrismaClient();
