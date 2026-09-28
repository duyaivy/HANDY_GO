import { All, Controller, NotFoundException, Req } from '@nestjs/common';
import type { Request } from 'express';

@Controller('{*path}')
export class FallbackController {
  @All()
  fallback(@Req() req: Request): never {
    throw new NotFoundException(
      `Cannot ${req.method} ${req.originalUrl || req.url}`,
    );
  }
}
