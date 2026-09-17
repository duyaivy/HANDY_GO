import { Injectable } from '@nestjs/common';

@Injectable()
export class UserTrustServiceService {
  getHello(): string {
    return 'Hello World!';
  }
}
