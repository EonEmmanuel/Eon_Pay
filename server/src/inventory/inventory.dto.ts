import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export class InventoryQueryDto {
  @IsOptional()
  @IsUUID("4")
  branchId?: string;
}

export class CreateCatalogProductDto {
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
  @MinLength(1)
  @MaxLength(40)
  storage!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(60)
  color!: string;

  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  cashPriceMinorUnits!: number;
}

export class UpdateCatalogProductDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  sku?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  brand?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  model?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  storage?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  color?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  cashPriceMinorUnits?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsInt()
  @Min(1)
  version!: number;
}

export class ProductImageUploadDto {
  @IsIn(["image/jpeg", "image/png", "image/webp"])
  mimeType!: "image/jpeg" | "image/png" | "image/webp";

  @IsInt()
  @Min(1)
  @Max(5 * 1024 * 1024)
  sizeBytes!: number;

  @Matches(/^[a-f0-9]{64}$/)
  sha256!: string;
}

export class ConfirmProductImageDto extends ProductImageUploadDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  objectKey!: string;
}

export class CreateInventoryUnitDto {
  @IsUUID("4")
  branchId!: string;

  @IsUUID("4")
  catalogProductId!: string;

  @Matches(/^[0-9]{15}$/)
  imei!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  serialNumber?: string;
}

const editableStatuses = ["available", "sold", "returned", "damaged"] as const;

export class UpdateInventoryUnitDto {
  @IsOptional()
  @IsEnum(editableStatuses)
  status?: (typeof editableStatuses)[number];

  @IsOptional()
  @Matches(/^[0-9]{15}$/)
  imei?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  serialNumber?: string;

  @IsInt()
  @Min(1)
  version!: number;
}
