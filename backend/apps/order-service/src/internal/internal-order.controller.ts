import {
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { buildSuccessResponse } from '@app/common';
import { InternalSecretGuard } from './guards/internal-secret.guard.js';
import { InternalOrderService } from './internal-order.service.js';
import { BiddingEligibilityResponseDto } from './dto/bidding-eligibility-response.dto.js';
import { PaymentEligibilityResponseDto } from './dto/payment-eligibility-response.dto.js';
import { ORDER_CONSTANTS } from '../common/constants/order.constants.js';

@ApiTags('Internal Orders & Requests')
@ApiHeader({
  name: ORDER_CONSTANTS.HEADER_INTERNAL_SECRET,
  description: 'Shared internal secret for microservice communication',
})
@UseGuards(InternalSecretGuard)
@Controller('internal')
export class InternalOrderController {
  constructor(private readonly internalOrderService: InternalOrderService) {}

  @Get('service-requests/:id/bidding-eligibility')
  @ApiOperation({
    summary: 'Internal check for bidding eligibility (Bidding Service)',
    description:
      'Checks if a Service Request is open for bidding and within the 24h bidding deadline.',
  })
  @ApiParam({ name: 'id', description: 'Service Request UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Bidding eligibility retrieved successfully',
    type: BiddingEligibilityResponseDto,
  })
  async getBiddingEligibility(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.internalOrderService.getBiddingEligibility(id);
    return buildSuccessResponse(
      data,
      'Bidding eligibility retrieved successfully',
    );
  }

  @Get('orders/:orderId/payment-eligibility')
  @ApiOperation({
    summary: 'Internal check for payment settlement eligibility (Payment Service)',
    description:
      'Verifies if an Order is completed and returns the exact agreed price as a Decimal string.',
  })
  @ApiParam({ name: 'orderId', description: 'Order UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Payment eligibility retrieved successfully',
    type: PaymentEligibilityResponseDto,
  })
  async getPaymentEligibility(
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    const data = await this.internalOrderService.getPaymentEligibility(orderId);
    return buildSuccessResponse(
      data,
      'Payment eligibility retrieved successfully',
    );
  }
}
