import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DigestService } from './digest/digest.service';
import { FetchService } from './fetch/fetch.service';
import { HnFetcher } from './fetch/hn.fetcher';
import { RssFetcher } from './fetch/rss.fetcher';
import { Item } from './items/item.entity';
import { ItemsService } from './items/items.service';

/** Everything except Telegram and the scheduler — also used by the CLI (src/cli.ts). */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'better-sqlite3',
        database: config.get('DB_PATH') || 'data/news.sqlite',
        entities: [Item],
        // Fine for a personal SQLite DB: tables follow the entities automatically.
        synchronize: true,
      }),
    }),
    TypeOrmModule.forFeature([Item]),
  ],
  providers: [ItemsService, RssFetcher, HnFetcher, FetchService, DigestService],
  exports: [ItemsService, FetchService, DigestService],
})
export class CoreModule {}
