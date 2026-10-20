import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { CoreModule } from './core.module';
import { DigestService } from './digest/digest.service';
import { FetchService } from './fetch/fetch.service';

/**
 * Run pieces of the pipeline without Telegram:
 *   npm run fetch:once       pull all sources into the DB
 *   npm run digest:preview   print the next digest (doesn't mark anything as sent)
 */
async function main() {
  const command = process.argv[2];
  const app = await NestFactory.createApplicationContext(CoreModule, { logger: ['log', 'warn', 'error'] });

  if (command === 'fetch') {
    await app.get(FetchService).fetchAll();
  } else if (command === 'preview') {
    const digest = await app.get(DigestService).build();
    console.log(digest ? digest.text : 'No unsent items — run `npm run fetch:once` first.');
  } else {
    console.log('Usage: cli.ts <fetch|preview>');
  }
  await app.close();
}

void main();
