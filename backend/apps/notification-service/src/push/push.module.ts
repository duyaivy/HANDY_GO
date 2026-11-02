import { Module } from '@nestjs/common';
import { DevicesModule } from '../devices/devices.module.js';
import { PushProvider } from './push-provider.js';
import { FirebasePushProvider } from './firebase-push.provider.js';
import { PushJobRepository } from './push-job.repository.js';
import { PushPolicyResolver } from './push-policy.resolver.js';
import { PushWorkerService } from './push-worker.service.js';

@Module({
  imports: [DevicesModule],
  providers: [
    FirebasePushProvider,
    {
      provide: PushProvider,
      useExisting: FirebasePushProvider,
    },
    PushJobRepository,
    PushPolicyResolver,
    PushWorkerService,
  ],
  exports: [PushJobRepository, PushPolicyResolver, PushProvider, PushWorkerService],
})
export class PushModule {}
