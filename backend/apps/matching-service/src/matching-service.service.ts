import { Injectable } from '@nestjs/common';

@Injectable()
export class MatchingServiceService {
  getHello(): string {
    return 'Hello World!';
  }
}
