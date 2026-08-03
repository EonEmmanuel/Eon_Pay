import { Equals, IsBoolean, IsEnum, IsString, MaxLength } from "class-validator";

export class StartKycSessionDto {
  @IsEnum(["en", "fr"])
  language!: "en" | "fr";

  @IsBoolean()
  @Equals(true)
  consentAccepted!: true;

  @IsString()
  @MaxLength(80)
  consentVersion!: string;
}
