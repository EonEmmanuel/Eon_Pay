import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";

const channels = [
  "cash",
  "mtn_momo",
  "orange_money",
  "bank_transfer",
  "card",
  "ussd",
] as const;

export class CreatePaymentDto {
  @IsUUID("4")
  customerId!: string;

  @IsOptional()
  @IsUUID("4")
  contractId?: string;

  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  amountMinorUnits!: number;

  @IsEnum(channels)
  channel!: (typeof channels)[number];

  @IsOptional()
  @IsString()
  @MaxLength(80)
  provider?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  externalReference?: string;
}

const targets = [
  "down_payment",
  "installment_principal",
  "installment_finance_charge",
  "fee",
  "unapplied_credit",
] as const;

export class PaymentAllocationDto {
  @IsEnum(targets)
  targetType!: (typeof targets)[number];

  @IsOptional()
  @IsUUID("4")
  contractId?: string;

  @IsOptional()
  @IsUUID("4")
  installmentId?: string;

  @IsOptional()
  @IsUUID("4")
  feeAssessmentId?: string;

  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  amountMinorUnits!: number;
}

export class SettlePaymentDto {
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PaymentAllocationDto)
  allocations!: PaymentAllocationDto[];
}

export class ReversePaymentDto {
  @IsString()
  @MaxLength(500)
  reason!: string;
}
