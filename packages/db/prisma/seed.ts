/**
 * Idempotent seed: upserts the taxonomy. Safe to run repeatedly; it never
 * deletes rows (a profession removed from the seed file stays in the DB, so
 * users following it keep working; deactivate it from the admin instead).
 */
import { PrismaClient } from "@prisma/client";
import { SOURCES } from "./seed-data/sources";
import { FIELDS_OF_STUDY, FUNCTIONS } from "./seed-data/taxonomy";
import { validateTaxonomy } from "./seed-data/validate";

async function main() {
  const problems = validateTaxonomy();
  if (problems.length) {
    throw new Error(`Taxonomy seed is invalid:\n- ${problems.join("\n- ")}`);
  }

  const prisma = new PrismaClient();
  try {
    let professions = 0;
    for (const [index, fn] of FUNCTIONS.entries()) {
      await prisma.jobFunction.upsert({
        where: { id: fn.id },
        create: { id: fn.id, name: fn.name, emoji: fn.emoji, sortOrder: index },
        update: { name: fn.name, emoji: fn.emoji, sortOrder: index },
      });
      for (const [id, name, aliases = []] of fn.professions) {
        await prisma.profession.upsert({
          where: { id },
          create: { id, name, aliases, functionId: fn.id },
          update: { name, aliases, functionId: fn.id },
        });
        professions++;
      }
    }

    for (const [id, name, aliases = []] of FIELDS_OF_STUDY) {
      await prisma.fieldOfStudy.upsert({
        where: { id },
        create: { id, name, aliases },
        update: { name, aliases },
      });
    }

    // Sources: descriptive fields follow the seed file; handle / channel id /
    // isActive / cursor are runtime state (set by the listener and admins), so
    // they are only written on create (handle only when the seed knows it).
    for (const s of SOURCES) {
      const descriptive = {
        title: s.title,
        kind: s.kind ?? "telegram",
        type: s.type,
        format: s.format,
        websiteDomains: s.websiteDomains,
        tier: s.tier,
        trust: s.trust,
        linkPriority: s.linkPriority,
        notes: s.notes ?? null,
      };
      const existing = await prisma.source.findUnique({ where: { id: s.key } });
      if (existing) {
        await prisma.source.update({
          where: { id: s.key },
          data: { ...descriptive, ...(existing.handle ? {} : { handle: s.handle }) },
        });
      } else {
        await prisma.source.create({ data: { id: s.key, handle: s.handle, ...descriptive } });
      }
    }

    console.log(
      `Seeded ${FUNCTIONS.length} functions, ${professions} professions, ${FIELDS_OF_STUDY.length} fields of study, ${SOURCES.length} sources.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
