// Prisma client singleton — exported for use by apps/api and apps/web
// Use this from anywhere:  import { prisma } from "@xovenmart/db";

import { PrismaClient } from "@prisma/client";

const globalForPrisma = global as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// Re-export Prisma types and enums for convenience
export * from "@prisma/client";
export { Prisma } from "@prisma/client";
