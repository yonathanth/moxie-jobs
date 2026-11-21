import { Controller, Get, NotFoundException, Param, ParseUUIDPipe, Res } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import type { Response } from "express";
import { applyTarget } from "@ethio/shared";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Apply-button redirect: records the first click on a delivered job, then
 * sends the user to the apply target. Public (opened from Telegram), and only
 * ever redirects to the job's own stored links.
 */
@Controller("r")
@SkipThrottle()
export class RedirectController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(":deliveryId")
  async go(@Param("deliveryId", new ParseUUIDPipe()) deliveryId: string, @Res() res: Response) {
    const delivery = await this.prisma.delivery.findUnique({ where: { id: deliveryId }, include: { job: true } });
    if (!delivery) throw new NotFoundException();
    if (!delivery.clickedAt) {
      await this.prisma.delivery.update({ where: { id: deliveryId }, data: { clickedAt: new Date() } });
    }
    const target = applyTarget(delivery.job).url;
    if (!/^https?:\/\//i.test(target)) throw new NotFoundException();
    res.redirect(302, target);
  }
}
