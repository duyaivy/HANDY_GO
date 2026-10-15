import { Test, TestingModule } from '@nestjs/testing';
import { ApiGatewayController } from './api-gateway.controller.js';
import { ApiGatewayService } from './api-gateway.service.js';

describe('ApiGatewayController', () => {
  let apiGatewayController: ApiGatewayController;
  let apiGatewayService: ApiGatewayService;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [ApiGatewayController],
      providers: [
        {
          provide: ApiGatewayService,
          useValue: {
            getAuthHealth: vi.fn().mockResolvedValue({ status: 'ok', service: 'auth-service' }),
          },
        },
      ],
    }).compile();

    apiGatewayController = app.get<ApiGatewayController>(ApiGatewayController);
    apiGatewayService = app.get<ApiGatewayService>(ApiGatewayService);
  });

  describe('services/auth/health', () => {
    it('should return auth service health status', async () => {
      const result = await apiGatewayController.getAuthHealth('req-123');
      expect(result).toEqual({ status: 'ok', service: 'auth-service' });
      expect(apiGatewayService.getAuthHealth).toHaveBeenCalledWith('req-123');
    });
  });
});
