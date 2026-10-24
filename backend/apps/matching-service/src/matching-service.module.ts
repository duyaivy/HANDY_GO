import {
  Module,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigModule } from '@app/config';
import { LoggerModule } from '@app/logger';
import { RabbitMQModule } from '@app/rabbitmq';
import { MatchingDatabaseModule } from '@app/database';
import { AuthModule } from '@app/auth';

import { HealthModule } from './health/health.module.js';

// Repositories & Outbox
import { MatchRunRepository } from './persistence/match-run.repository.js';
import { ConsumedEventRepository } from './persistence/consumed-event.repository.js';
import { MatchingOutboxRepository } from './persistence/matching-outbox.repository.js';
import { MatchingOutboxPublisherService } from './outbox/matching-outbox-publisher.service.js';

// Projections
import { ServiceRequestProjectionService } from './projections/service-request-projection.service.js';

// Eligibility & Features
import { EligibilityService } from './eligibility/eligibility.service.js';
import { FeatureBuilderService } from './features/feature-builder.service.js';

// Ranking Providers & Validation
import { RANKING_PROVIDER } from './ranking/ranking-provider.interface.js';
import { MockAiRankingProvider } from './ranking/mock-ai-ranking.provider.js';
import { RuleBasedFallbackRanker } from './ranking/rule-based-fallback.ranker.js';
import { RankingValidatorService } from './ranking/ranking-validator.service.js';

// Candidate Providers
import { CANDIDATE_PROVIDER } from './candidates/candidate.provider.interface.js';
import { UserTrustCandidateProvider } from './candidates/user-trust-candidate.provider.js';
import { TestCandidateAdapter } from './candidates/test-candidate.adapter.js';

// Orchestration & Queue
import { MatchingOrchestratorService } from './orchestrator/matching-orchestrator.service.js';
import { MatchingJobQueueService } from './queue/matching-job-queue.service.js';

// Guards
import { InternalServiceGuard } from './guards/internal-service.guard.js';

// Controllers & Consumers
import { CustomerMatchingController } from './controllers/customer-matching.controller.js';
import { InternalMatchingController } from './controllers/internal-matching.controller.js';
import { MatchingEventConsumer } from './consumers/matching-event.consumer.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      serviceName: 'matching-service',
      defaultPort: 3006,
    }),
    LoggerModule.forRoot('matching-service'),
    HealthModule,
    RabbitMQModule,
    MatchingDatabaseModule,
    AuthModule,
  ],
  controllers: [
    CustomerMatchingController,
    InternalMatchingController,
    MatchingEventConsumer,
  ],
  providers: [
    // Persistence
    MatchRunRepository,
    ConsumedEventRepository,
    MatchingOutboxRepository,
    MatchingOutboxPublisherService,

    // Projections
    ServiceRequestProjectionService,

    // Eligibility & Features
    EligibilityService,
    FeatureBuilderService,

    // Ranking
    MockAiRankingProvider,
    RuleBasedFallbackRanker,
    RankingValidatorService,
    {
      provide: RANKING_PROVIDER,
      useClass: MockAiRankingProvider,
    },

    // Candidates
    UserTrustCandidateProvider,
    TestCandidateAdapter,
    {
      provide: CANDIDATE_PROVIDER,
      useClass: UserTrustCandidateProvider,
    },

    // Queue & Orchestration
    MatchingOrchestratorService,
    MatchingJobQueueService,

    // Guards
    InternalServiceGuard,
  ],
  exports: [
    MatchingOrchestratorService,
    MatchingJobQueueService,
    MatchRunRepository,
    ServiceRequestProjectionService,
    CANDIDATE_PROVIDER,
    RANKING_PROVIDER,
    TestCandidateAdapter,
  ],
})
export class MatchingServiceModule implements OnModuleInit {
  constructor(
    private readonly jobQueue: MatchingJobQueueService,
    private readonly orchestrator: MatchingOrchestratorService,
  ) {}

  onModuleInit(): void {
    // Connect background queue worker to orchestrator
    this.jobQueue.setProcessor((job) =>
      this.orchestrator.processMatchingJob(job),
    );
  }
}
