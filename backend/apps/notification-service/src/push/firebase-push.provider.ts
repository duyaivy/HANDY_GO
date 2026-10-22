import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@app/config';
import {
  initializeApp,
  getApps,
  cert,
  applicationDefault,
  deleteApp,
  type App,
} from 'firebase-admin/app';
import {
  getMessaging,
  type Messaging,
  type Message,
} from 'firebase-admin/messaging';
import * as fs from 'node:fs';
import {
  PushProvider,
  type PushMessage,
  type PushSendResult,
} from './push-provider.js';
import { PushErrorClassifier } from './push-error-classifier.js';
import { PUSH_DEFAULTS } from './push.constants.js';

const FIREBASE_APP_NAME = 'handy-go-notification-service';

@Injectable()
export class FirebasePushProvider
  extends PushProvider
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(FirebasePushProvider.name);
  private app: App | null = null;
  private messaging: Messaging | null = null;

  constructor(private readonly config: ConfigService) {
    super();
  }

  async onModuleInit(): Promise<void> {
    const pushEnabled = this.config.get('PUSH_ENABLED') === 'true';
    if (!pushEnabled) {
      this.logger.log('Push delivery is disabled (PUSH_ENABLED is not true)');
      return;
    }

    const rawSaBase64 = (
      this.config.get('FIREBASE_SA_BASE64') ||
      process.env.FIREBASE_SA_BASE64 ||
      ''
    ).trim();
    const saBase64 = rawSaBase64.startsWith('base64:')
      ? rawSaBase64.slice(7).trim()
      : rawSaBase64;

    let saPath =
      this.config.get('GOOGLE_APPLICATION_CREDENTIALS') ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS;

    // Fallback: nếu không cấu hình GOOGLE_APPLICATION_CREDENTIALS, kiểm tra đường dẫn mặc định
    if (!saBase64 && (!saPath || !fs.existsSync(saPath))) {
      const defaultPaths = [
        '/app/secrets/firebase-service-account.json',
        'secrets/firebase-service-account.json',
      ];
      for (const p of defaultPaths) {
        if (fs.existsSync(p)) {
          saPath = p;
          break;
        }
      }
    }

    let projectId =
      this.config.get('FIREBASE_PROJECT_ID') ||
      process.env.FIREBASE_PROJECT_ID;

    try {
      const existingApp = getApps().find((a) => a.name === FIREBASE_APP_NAME);
      if (existingApp) {
        this.app = existingApp;
        this.messaging = getMessaging(this.app);
        this.logger.log('Reusing existing Firebase App instance');
        return;
      }

      let credential;
      if (saBase64) {
        this.logger.log(
          'Initializing Firebase with base64 service account credential (FIREBASE_SA_BASE64)',
        );
        try {
          const jsonStr = Buffer.from(saBase64, 'base64').toString('utf8');
          const serviceAccount = JSON.parse(jsonStr);
          credential = cert(serviceAccount);
          if (!projectId && serviceAccount.project_id) {
            projectId = serviceAccount.project_id;
          }
        } catch (parseError) {
          throw new Error(
            `Failed to parse FIREBASE_SA_BASE64: ${(parseError as Error).message}`,
          );
        }
      } else if (saPath && fs.existsSync(saPath)) {
        this.logger.log(`Initializing Firebase with credentials from: ${saPath}`);
        const content = fs.readFileSync(saPath, 'utf8');
        const serviceAccount = JSON.parse(content);
        credential = cert(serviceAccount);
        if (!projectId && serviceAccount.project_id) {
          projectId = serviceAccount.project_id;
        }
      } else if (projectId) {
        this.logger.log(`Initializing Firebase with applicationDefault and projectId: ${projectId}`);
        credential = applicationDefault();
      } else {
        throw new Error(
          'Firebase credentials missing. Provide FIREBASE_SA_BASE64, GOOGLE_APPLICATION_CREDENTIALS file path, or FIREBASE_PROJECT_ID when PUSH_ENABLED=true',
        );
      }

      this.app = initializeApp(
        {
          credential,
          projectId: projectId || undefined,
        },
        FIREBASE_APP_NAME,
      );
      this.messaging = getMessaging(this.app);
      this.logger.log('Firebase Cloud Messaging initialized successfully');
    } catch (error) {
      this.logger.error(
        `Failed to initialize Firebase Admin SDK: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw error;
    }
  }

  async sendEach(messages: PushMessage[]): Promise<PushSendResult[]> {
    if (messages.length === 0) {
      return [];
    }

    if (!this.messaging) {
      return messages.map((msg) => ({
        jobId: msg.jobId,
        token: msg.token,
        success: false,
        errorCode: 'PUSH_DISABLED',
        errorMessage: 'Firebase messaging is not initialized or push is disabled',
        shouldDeactivateToken: false,
        isTransient: false,
      }));
    }

    const results: PushSendResult[] = [];
    const batchLimit = PUSH_DEFAULTS.FCM_BATCH_LIMIT;

    for (let offset = 0; offset < messages.length; offset += batchLimit) {
      const slice = messages.slice(offset, offset + batchLimit);
      const fcmMessages: Message[] = slice.map((msg) => ({
        token: msg.token,
        notification: {
          title: msg.title,
          body: msg.body,
        },
        data: msg.data,
      }));

      try {
        const batchResponse = await this.messaging.sendEach(fcmMessages);
        for (let i = 0; i < batchResponse.responses.length; i++) {
          const resp = batchResponse.responses[i];
          const original = slice[i];

          if (resp.success) {
            results.push({
              jobId: original.jobId,
              token: original.token,
              success: true,
              messageId: resp.messageId,
              shouldDeactivateToken: false,
              isTransient: false,
            });
          } else {
            const error = resp.error;
            const classification = PushErrorClassifier.classify(
              error?.code,
              error?.message,
            );
            results.push({
              jobId: original.jobId,
              token: original.token,
              success: false,
              errorCode: error?.code,
              errorMessage: classification.sanitizedMessage,
              shouldDeactivateToken: classification.shouldDeactivateToken,
              isTransient: classification.isTransient,
            });
          }
        }
      } catch (batchError) {
        // If the entire HTTP call failed (e.g., DNS, network, TLS failure)
        const err = batchError as Error & { code?: string };
        const classification = PushErrorClassifier.classify(
          err.code,
          err.message,
        );
        this.logger.warn(
          `Batch FCM request failed for ${slice.length} messages: ${classification.sanitizedMessage}`,
        );
        for (const original of slice) {
          results.push({
            jobId: original.jobId,
            token: original.token,
            success: false,
            errorCode: err.code || 'BATCH_SEND_ERROR',
            errorMessage: classification.sanitizedMessage,
            shouldDeactivateToken: classification.shouldDeactivateToken,
            isTransient: true,
          });
        }
      }
    }

    return results;
  }

  async shutdown(): Promise<void> {
    if (this.app) {
      try {
        await deleteApp(this.app);
        this.logger.log('Firebase App instance successfully closed');
      } catch (err) {
        this.logger.warn(
          `Error closing Firebase App: ${(err as Error).message}`,
        );
      } finally {
        this.app = null;
        this.messaging = null;
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.shutdown();
  }
}
