import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsISO8601,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";

const providers = ["mtn_momo", "orange_money", "bank_transfer", "card"] as const;
const statuses = ["pending", "settled", "failed", "cancelled", "reversed"] as const;

export class ReconciliationStatementItemDto {
  @IsString()
  @MaxLength(160)
  externalReference!: string;

  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  amountMinorUnits!: number;

  @IsEnum(statuses)
  status!: (typeof statuses)[number];
}

export class CreateReconciliationRunDto {
  @IsEnum(providers)
  provider!: (typeof providers)[number];

  @IsISO8601({ strict: true })
  periodStart!: string;

  @IsISO8601({ strict: true })
  periodEnd!: string;

  @IsArray()
  @ArrayMaxSize(5_000)
  @ValidateNested({ each: true })
  @Type(() => ReconciliationStatementItemDto)
  items!: ReconciliationStatementItemDto[];
}
