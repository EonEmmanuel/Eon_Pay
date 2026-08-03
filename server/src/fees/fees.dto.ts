import { Type } from "class-transformer";
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";

const feeKinds = [
  "origination",
  "late_payment",
  "collection",
  "device_restriction",
  "restructuring",
  "other",
] as const;
const subjectTypes = ["application", "contract", "installment", "payment"] as const;

export class FeeCalculationDto {
  @IsEnum(["fixed", "percentage"])
  method!: "fixed" | "percentage";

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  basisAmountMinorUnits?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000)
  rateBasisPoints?: number;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  policyCode!: string;

  @IsInt()
  @Min(1)
  policyVersion!: number;
}

export class AssessFeeDto {
  @IsEnum(subjectTypes)
  subjectType!: (typeof subjectTypes)[number];

  @IsOptional()
  @IsUUID("4")
  applicationId?: string;

  @IsOptional()
  @IsUUID("4")
  contractId?: string;

  @IsOptional()
  @IsUUID("4")
  installmentId?: string;

  @IsOptional()
  @IsUUID("4")
  paymentId?: string;

  @IsEnum(feeKinds)
  kind!: (typeof feeKinds)[number];

  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  amountMinorUnits!: number;

  @ValidateNested()
  @Type(() => FeeCalculationDto)
  calculation!: FeeCalculationDto;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dueDate?: string;
}

export class WaiveFeeDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
