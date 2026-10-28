import { describe, it, expect, beforeEach } from 'vitest';
import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(() => {
    controller = new HealthController();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
