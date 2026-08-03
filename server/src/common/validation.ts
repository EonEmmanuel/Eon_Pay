import {
  IsInt,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export class MoneyDto {
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  minorUnits!: number;

  @IsString()
  @Matches(/^XAF$/)
  currency!: "XAF";
}

export class PaginationQueryDto {
  @IsInt()
  @Min(1)
  page = 1;

  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 25;
}

export class IdParamDto {
  @IsUUID("4")
  id!: string;
}

export class ReasonDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
