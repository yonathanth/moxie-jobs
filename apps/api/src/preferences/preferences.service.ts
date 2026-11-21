import { Injectable, UnprocessableEntityException } from "@nestjs/common";
import type { User } from "@ethio/db";
import type { Preferences, PreferencesDto } from "@ethio/shared";
import { PrismaService } from "../prisma/prisma.service";
import { effectivePlan, resolveLimits } from "../settings/plan";
import { SettingsService } from "../settings/settings.service";
import { TaxonomyService } from "../taxonomy/taxonomy.service";
import { checkPreferences } from "./preferences.rules";

@Injectable()
export class PreferencesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly taxonomy: TaxonomyService,
  ) {}

  async get(userId: string): Promise<PreferencesDto | null> {
    const [prefs, professions, functions] = await Promise.all([
      this.prisma.userPreferences.findUnique({ where: { userId } }),
      this.prisma.userProfession.findMany({ where: { userId }, orderBy: { sortOrder: "asc" } }),
      this.prisma.userFunction.findMany({ where: { userId } }),
    ]);
    if (!prefs) return null;
    return {
      professionIds: professions.map((p) => p.professionId),
      functionIds: functions.map((f) => f.functionId),
      fieldOfStudyIds: prefs.fieldOfStudyIds,
      educationLevel: prefs.educationLevel as Preferences["educationLevel"],
      experienceBand: prefs.experienceBand as Preferences["experienceBand"],
      locationIds: prefs.locationIds,
      remoteOk: prefs.remoteOk,
      employmentTypes: prefs.employmentTypes as Preferences["employmentTypes"],
      gender: prefs.gender as Preferences["gender"],
      overseasOk: prefs.overseasOk,
      salaryMin: prefs.salaryMin,
      salaryMax: prefs.salaryMax,
      updatedAt: prefs.updatedAt.toISOString(),
    };
  }

  /**
   * Replaces the user's preferences. Returns whether this save completed onboarding.
   * Note: if a Pro user later drops to Free, their saved lists are kept as-is;
   * matching applies the current plan's caps (first N, in saved order).
   */
  async save(user: User, input: Preferences): Promise<{ prefs: PreferencesDto; firstTime: boolean }> {
    const settings = await this.settings.get();
    const limits = resolveLimits(effectivePlan(user, settings), settings);
    const issues = checkPreferences(input, await this.taxonomy.index(), limits);
    if (issues.length) throw new UnprocessableEntityException({ message: "Invalid preferences", issues });

    const data = {
      fieldOfStudyIds: input.fieldOfStudyIds,
      educationLevel: input.educationLevel,
      experienceBand: input.experienceBand,
      locationIds: input.locationIds,
      remoteOk: input.remoteOk,
      employmentTypes: input.employmentTypes,
      gender: input.gender,
      overseasOk: input.overseasOk,
      salaryMin: input.salaryMin,
      salaryMax: input.salaryMax,
    };
    const firstTime = user.onboardedAt === null;

    await this.prisma.$transaction([
      this.prisma.userPreferences.upsert({ where: { userId: user.id }, create: { userId: user.id, ...data }, update: data }),
      this.prisma.userProfession.deleteMany({ where: { userId: user.id } }),
      this.prisma.userProfession.createMany({
        data: input.professionIds.map((professionId, sortOrder) => ({ userId: user.id, professionId, sortOrder })),
      }),
      this.prisma.userFunction.deleteMany({ where: { userId: user.id } }),
      this.prisma.userFunction.createMany({
        data: input.functionIds.map((functionId) => ({ userId: user.id, functionId })),
      }),
      ...(firstTime
        ? [this.prisma.user.update({ where: { id: user.id }, data: { onboardedAt: new Date() } })]
        : []),
    ]);

    const prefs = await this.get(user.id);
    return { prefs: prefs!, firstTime };
  }
}
