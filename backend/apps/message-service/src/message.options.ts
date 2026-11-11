import type { TokenVerifierService } from '../../../libs/auth/src/token-verifier.service.js';
import type { AuthorityClient } from './authority.js';
import type { MessagePrisma } from './persistence.js';

export interface MessageAppOptions {
  db: MessagePrisma;
  authority: AuthorityClient;
  verifier: TokenVerifierService;
  cursorSecret: string;
  origins: string[];
  brokerUrl?: string;
}

export const MESSAGE_OPTIONS = Symbol('MESSAGE_OPTIONS');
