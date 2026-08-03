import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export const platformSettingKeys = ["general", "risk_rules"] as const;
export type PlatformSettingKey = (typeof platformSettingKeys)[number];

export class PlatformSettingKeyParamDto {
  @IsIn(platformSettingKeys)
  key!: PlatformSettingKey;
}

export class UpdatePlatformSettingDto {
  @IsObject()
  value!: Record<string, unknown>;

  @IsInt()
  @Min(1)
  version!: number;
}
