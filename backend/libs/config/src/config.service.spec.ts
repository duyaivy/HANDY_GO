import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from './config.module.js';
import { ConfigService } from './config.service.js';

describe('ConfigService', () => {
  let service: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          serviceName: 'test-service',
          defaultPort: 3999,
        }),
      ],
    }).compile();

    service = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
