import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CoreModule } from './core.module';
import { SchedulerService } from './scheduler/scheduler.service';
import { TelegramService } from './telegram/telegram.service';

@Module({
  imports: [CoreModule, ScheduleModule.forRoot()],
  providers: [TelegramService, SchedulerService],
})
export class AppModule {}
