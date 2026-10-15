import { All, Controller, NotFoundException, Req } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request } from 'express';

@ApiExcludeController()
@Controller('{*path}')
export class FallbackController {
  @All()
  fallback(@Req() req: Request): never {
    throw new NotFoundException(
      `Cannot ${req.method} ${req.originalUrl || req.url}`,
    );
  }
}
