import { Injectable } from '@nestjs/common';

@Injectable()
export class TrackingServiceService {
  getHello(): string {
    return 'Hello World!';
  }
}
