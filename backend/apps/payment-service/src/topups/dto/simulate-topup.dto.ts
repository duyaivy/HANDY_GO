import { Equals, IsIn } from 'class-validator';

export class SimulateTopupDto {
  @IsIn(['succeeded', 'failed']) outcome!: 'succeeded' | 'failed';
  @Equals(true) confirmSimulated!: true;
}
