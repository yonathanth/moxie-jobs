import { Body, Controller, Get, Header, HttpCode, Post, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { z } from "zod";
import type { ResolveTermResponse, TaxonomyDto } from "@ethio/shared";
import { AuthGuard } from "../auth/auth.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { TaxonomyService } from "./taxonomy.service";
import { TermResolverService } from "./term-resolver.service";

const resolveSchema = z.object({ kind: z.enum(["field", "profession"]), text: z.string().trim().min(2).max(80) }).strict();

@Controller("taxonomy")
export class TaxonomyController {
  constructor(
    private readonly taxonomy: TaxonomyService,
    private readonly resolver: TermResolverService,
  ) {}

  /** Public: functions → professions, fields of study and cities for pickers. */
  @Get()
  @Header("Cache-Control", "public, max-age=300")
  get(): Promise<TaxonomyDto> {
    return this.taxonomy.get();
  }

  /** "Not listed": maps typed text to the closest degrees / professions (saved answer, local match, then AI). */
  @Post("resolve")
  @HttpCode(200)
  @UseGuards(AuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  resolve(@Body(new ZodValidationPipe(resolveSchema)) body: z.infer<typeof resolveSchema>): Promise<ResolveTermResponse> {
    return this.resolver.resolve(body.kind, body.text);
  }
}
