import { Type } from "class-transformer";
import {
  IsEmail,
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

export class ApplicantDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  fullName!: string;

  @IsString()
  @Matches(/^\+?[1-9][0-9]{7,14}$/)
  phone!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  nationalIdReference?: string;
}

export class DeviceSnapshotDto {
  @IsUUID("4")
  deviceId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  sku!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  brand!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  model!: string;

  @IsString()
  @MaxLength(40)
  storage!: string;

  @IsString()
  @MaxLength(60)
  color!: string;

  @IsOptional()
  @Matches(/^[0-9]{15}$/)
  imei?: string;
}

const frequencies = ["weekly", "biweekly", "monthly"] as const;
type Frequency = (typeof frequencies)[number];

export class RequestedTermsDto {
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  deviceCashPriceMinorUnits!: number;

  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  proposedDownPaymentMinorUnits!: number;

  @IsInt()
  @Min(1)
  @Max(104)
  requestedInstallmentCount!: number;

  @IsEnum(frequencies)
  requestedRepaymentFrequency!: Frequency;
}

export class ApprovedTermsDto {
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  deviceCashPriceMinorUnits!: number;

  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  downPaymentMinorUnits!: number;

  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  financedPrincipalMinorUnits!: number;

  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  financeChargeMinorUnits!: number;

  @IsInt()
  @Min(1)
  @Max(104)
  installmentCount!: number;

  @IsEnum(frequencies)
  repaymentFrequency!: Frequency;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  firstDueDate!: string;

  @IsInt()
  @Min(0)
  @Max(90)
  gracePeriodDays!: number;
}

export class CreateApplicationDto {
  @IsUUID("4")
  branchId!: string;

  @IsOptional()
  @IsUUID("4")
  customerId?: string;

  @ValidateNested()
  @Type(() => ApplicantDto)
  applicant!: ApplicantDto;

  @IsUUID("4")
  catalogProductId!: string;

  @ValidateNested()
  @Type(() => RequestedTermsDto)
  requestedTerms!: RequestedTermsDto;
}

const kycStatuses = [
  "not_started",
  "pending",
  "verified",
  "needs_correction",
  "failed",
] as const;

export class ReviewKycDto {
  @IsEnum(kycStatuses)
  status!: (typeof kycStatuses)[number];
}

export class DecideApplicationDto {
  @IsEnum(["approved", "rejected"])
  outcome!: "approved" | "rejected";

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  reasonCode!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1_000)
  notes?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ApprovedTermsDto)
  approvedTerms?: ApprovedTermsDto;
}
