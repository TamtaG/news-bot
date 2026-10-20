import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { FetchService } from '../fetch/fetch.service';
import { TelegramService } from '../telegram/telegram.service';

/**
 * Two jobs: fetch every hour (so the DB fills up over the day), and send the digest
 * on DIGEST_CRON. Registered at runtime because @Cron() can't read .env values.
 */
@Injectable()
export class SchedulerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly registry: SchedulerRegistry,
    private readonly fetcher: FetchService,
    private readonly telegram: TelegramService,
  ) {}

  onApplicationBootstrap() {
    const tz = this.config.get<string>('TZ') || 'UTC';
    const digestCron = this.config.get<string>('DIGEST_CRON') || '0 8 * * *';

    this.add('fetch', '0 * * * *', tz, () => this.fetcher.fetchAll());
    // Fetch right before sending so the digest has the latest items.
    this.add('digest', digestCron, tz, async () => {
      await this.fetcher.fetchAll();
      await this.telegram.sendDigest();
    });

    // Fill the DB on startup instead of waiting up to an hour.
    void this.run('fetch', () => this.fetcher.fetchAll());
  }

  private add(name: string, cron: string, timeZone: string, task: () => Promise<unknown>) {
    const job = CronJob.from({ cronTime: cron, timeZone, onTick: () => this.run(name, task), start: true });
    this.registry.addCronJob(name, job);
    this.logger.log(`Job "${name}" scheduled: ${cron} (${timeZone}), next at ${job.nextDate().toISO()}`);
  }

  private async run(name: string, task: () => Promise<unknown>) {
    try {
      await task();
    } catch (err) {
      this.logger.error(`Job "${name}" failed: ${(err as Error).message}`);
    }
  }
}
