import { Controller, Headers, NotFoundException, Post, UnauthorizedException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { timingSafeEqual } from 'node:crypto';
import { Public } from '../auth/decorators';
import { OutboxService } from './outbox.service';

/** POST /internal/outbox/tick with header x-cron-secret. Disabled unless CRON_SECRET is set. */
@ApiExcludeController()
@Controller('internal')
export class InternalController {
  constructor(private readonly outbox: OutboxService) {}

  @Public()
  @Post('outbox/tick')
  async tick(@Headers('x-cron-secret') secret?: string) {
    const expected = process.env.CRON_SECRET;
    if (!expected) throw new NotFoundException();
    const a = Buffer.from(secret ?? ''); const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new UnauthorizedException();
    await this.outbox.tick();
    return { ok: true };
  }
}
