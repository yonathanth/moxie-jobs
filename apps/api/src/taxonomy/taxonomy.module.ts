import { Module } from "@nestjs/common";
import { TaxonomyController } from "./taxonomy.controller";
import { TaxonomyService } from "./taxonomy.service";
import { TermResolverService } from "./term-resolver.service";

@Module({
  controllers: [TaxonomyController],
  providers: [TaxonomyService, TermResolverService],
  exports: [TaxonomyService],
})
export class TaxonomyModule {}
