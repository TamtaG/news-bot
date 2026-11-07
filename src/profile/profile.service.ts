import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Profile } from './profile.entity';

export const PROFILE_MAX_LENGTH = 2000;

/** Starting point until the reader writes their own with /profile. */
export const DEFAULT_PROFILE = `Backend software engineer, 5+ years, mostly NestJS / TypeScript / Node.js, MySQL, Redis, BullMQ.
Interested in: AI tooling for developers (coding agents, LLM APIs, MCP, evals), backend and infrastructure tools, practical system design.
Goals: grow my career (currently job searching), build portfolio projects with applied AI.
Not interested in: funding rounds and IPOs, consumer AI gadgets, AI for biology or chemistry, image and video generation.`;

@Injectable()
export class ProfileService {
  constructor(@InjectRepository(Profile) private readonly repo: Repository<Profile>) {}

  async get(chatId: string | undefined): Promise<string> {
    if (!chatId) return DEFAULT_PROFILE;
    const profile = await this.repo.findOneBy({ chatId });
    return profile?.text ?? DEFAULT_PROFILE;
  }

  async set(chatId: string, text: string): Promise<void> {
    await this.repo.upsert({ chatId, text: text.slice(0, PROFILE_MAX_LENGTH) }, ['chatId']);
  }
}
