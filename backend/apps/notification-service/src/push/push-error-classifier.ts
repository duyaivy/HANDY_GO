import {
  TOKEN_INVALID_ERROR_CODES,
  TRANSIENT_ERROR_CODES,
} from './push.constants.js';

export interface ErrorClassification {
  isTransient: boolean;
  shouldDeactivateToken: boolean;
  sanitizedMessage: string;
}

export class PushErrorClassifier {
  static classify(
    errorCode?: string,
    errorMessage?: string,
  ): ErrorClassification {
    const code = errorCode?.toLowerCase() ?? '';
    const message = errorMessage ?? '';

    // Check if token is permanently invalid
    const isTokenInvalid =
      TOKEN_INVALID_ERROR_CODES.has(code) ||
      code.includes('registration-token-not-registered') ||
      code.includes('invalid-registration-token') ||
      message.includes('registration token is not registered') ||
      message.includes('Requested entity was not found');

    // Check if error is transient / retryable
    const isTransient =
      !isTokenInvalid &&
      (TRANSIENT_ERROR_CODES.has(code) ||
        code.includes('unavailable') ||
        code.includes('internal-error') ||
        code.includes('quota-exceeded') ||
        code.includes('timeout') ||
        message.includes('ETIMEDOUT') ||
        message.includes('ECONNRESET') ||
        message.includes('ECONNREFUSED') ||
        message.includes('503') ||
        message.includes('500'));

    // Sanitize message: remove potential tokens, truncate to 500 characters
    let sanitizedMessage = message || (code ? `FCM error: ${code}` : 'Unknown push delivery error');
    if (sanitizedMessage.length > 500) {
      sanitizedMessage = sanitizedMessage.slice(0, 497) + '...';
    }

    return {
      isTransient,
      shouldDeactivateToken: isTokenInvalid,
      sanitizedMessage,
    };
  }
}
