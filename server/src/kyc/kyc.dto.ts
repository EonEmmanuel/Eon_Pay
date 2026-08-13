import { Equals, IsBoolean, IsEnum, IsOptional, IsString, MaxLength, IsUrl } from "class-validator";

export class StartKycSessionDto {
  @IsEnum(["en", "fr"])
  language!: "en" | "fr";

  @IsBoolean()
  @Equals(true)
  consentAccepted!: true;

  @IsString()
  @MaxLength(80)
  consentVersion!: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  callbackUrl?: string;
}
