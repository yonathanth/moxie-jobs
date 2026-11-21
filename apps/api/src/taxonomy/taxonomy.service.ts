import { Injectable } from "@nestjs/common";
import { CITIES, type TaxonomyDto } from "@ethio/shared";
import { PrismaService } from "../prisma/prisma.service";

const CACHE_MS = 5 * 60_000;

export interface TaxonomyIndex {
  professionIds: ReadonlySet<string>;
  functionIds: ReadonlySet<string>;
  fieldOfStudyIds: ReadonlySet<string>;
}

/** Active taxonomy, cached in memory (it changes only when admins edit it). */
@Injectable()
export class TaxonomyService {
  private cache: { dto: TaxonomyDto; index: TaxonomyIndex; at: number } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<TaxonomyDto> {
    return (await this.load()).dto;
  }

  async index(): Promise<TaxonomyIndex> {
    return (await this.load()).index;
  }

  invalidate() {
    this.cache = null;
  }

  private async load() {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache;

    const [functions, fields] = await Promise.all([
      this.prisma.jobFunction.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
        include: { professions: { where: { isActive: true }, orderBy: { name: "asc" } } },
      }),
      this.prisma.fieldOfStudy.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    ]);

    const dto: TaxonomyDto = {
      functions: functions.map((f) => ({
        id: f.id,
        name: f.name,
        emoji: f.emoji,
        professions: f.professions.map((p) => ({ id: p.id, name: p.name, functionId: p.functionId, aliases: p.aliases })),
      })),
      fieldsOfStudy: fields.map((f) => ({ id: f.id, name: f.name, aliases: f.aliases })),
      cities: CITIES,
    };
    const index: TaxonomyIndex = {
      functionIds: new Set(functions.map((f) => f.id)),
      professionIds: new Set(functions.flatMap((f) => f.professions.map((p) => p.id))),
      fieldOfStudyIds: new Set(fields.map((f) => f.id)),
    };
    this.cache = { dto, index, at: Date.now() };
    return this.cache;
  }
}
