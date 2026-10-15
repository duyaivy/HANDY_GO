import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { RabbitMQService } from './rabbitmq.service.js';

describe('RabbitMQService', () => {
  let service: RabbitMQService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RabbitMQService,
        {
          provide: 'RABBITMQ_CLIENT',
          useValue: {
            emit: () => ({ toPromise: () => Promise.resolve() }),
            send: () => ({ toPromise: () => Promise.resolve() }),
            close: () => Promise.resolve(),
          },
        },
      ],
    }).compile();

    service = module.get<RabbitMQService>(RabbitMQService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
