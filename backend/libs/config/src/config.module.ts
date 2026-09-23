import { DynamicModule, Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { ConfigService } from './config.service.js';

export interface ConfigModuleOptions {
  serviceName: string;
  defaultPort: number;
  requiredUrls?: string[];
}

@Global()
@Module({})
export class ConfigModule {
  static forRoot(options: ConfigModuleOptions): DynamicModule {
    return {
      module: ConfigModule,
      imports: [
        NestConfigModule.forRoot({
          cache: true,
          expandVariables: true,
          envFilePath: [`apps/${options.serviceName}/.env`, '.env'],
          validate: (config: Record<string, unknown>) =>
            validateEnvironment(config, options),
        }),
      ],
      providers: [ConfigService],
      exports: [ConfigService, NestConfigModule],
    };
  }
}

function validateEnvironment(
  input: Record<string, unknown>,
  options: ConfigModuleOptions,
): Record<string, unknown> {
  const config = { ...input };
  config.SERVICE_NAME = options.serviceName;
  config.NODE_ENV ??= 'development';
  config.LOG_LEVEL ??= config.NODE_ENV === 'production' ? 'info' : 'debug';
  config.PORT ??= String(options.defaultPort);
  config.API_PREFIX ??= 'api/v1';
  config.CORS_ORIGIN ??= 'http://localhost:5173';
  config.UPSTREAM_TIMEOUT_MS ??= '3000';

  const port = Number(config.PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }

  const environments = ['development', 'test', 'production'];
  if (!environments.includes(String(config.NODE_ENV))) {
    throw new Error(`NODE_ENV must be one of: ${environments.join(', ')}`);
  }

  const logLevels = [
    'fatal',
    'error',
    'warn',
    'info',
    'debug',
    'trace',
    'silent',
  ];
  if (!logLevels.includes(String(config.LOG_LEVEL))) {
    throw new Error(`LOG_LEVEL must be one of: ${logLevels.join(', ')}`);
  }

  for (const key of options.requiredUrls ?? []) {
    const value = config[key];
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`${key} is required`);
    }
    try {
      new URL(value);
    } catch {
      throw new Error(`${key} must be a valid URL`);
    }
  }

  return config;
}
