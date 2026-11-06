import type { TokenVerifierService } from '../../../libs/auth/src/token-verifier.service.js';
import type { JwtPayload } from '../../../libs/auth/src/auth.types.js';
import { AuthorityClient } from './authority.js';
import { ChatError } from './security.js';
const uuid =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export class IdentityService {
  constructor(
    private readonly verifier: TokenVerifierService,
    private readonly authority: AuthorityClient,
  ) {}
  async authenticate(token: unknown): Promise<JwtPayload> {
    if (typeof token !== 'string' || token.length > 8192)
      throw new ChatError('UNAUTHORIZED');
    let user: JwtPayload;
    try {
      user = await this.verifier.verifyAccessToken(token);
    } catch {
      throw new ChatError('UNAUTHORIZED');
    }
    if (
      user.tokenType !== 'access' ||
      ![user.sub, user.userId, user.sid].every(
        (value) => typeof value === 'string' && uuid.test(value),
      ) ||
      !Number.isInteger(user.exp) ||
      user.exp! * 1000 <= Date.now()
    )
      throw new ChatError('UNAUTHORIZED');
    if (!(await this.authority.active(user.sub, user.userId, user.sid)))
      throw new ChatError('UNAUTHORIZED');
    return user;
  }
}
