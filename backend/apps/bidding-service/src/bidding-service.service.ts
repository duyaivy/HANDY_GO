import { Injectable } from '@nestjs/common';

@Injectable()
export class BiddingServiceService {
  getHello(): string {
    return 'Hello World!';
  }
}
