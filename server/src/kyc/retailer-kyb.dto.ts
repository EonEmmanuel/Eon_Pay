import {
  Equals,
  IsBoolean,
  IsEnum,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

export class StartRetailerKybDto {
  @IsEnum(["en", "fr"])
  language!: "en" | "fr";

  @IsBoolean()
  @Equals(true)
  consentAccepted!: true;

  @IsString()
  @MaxLength(80)
  consentVersion!: string;
}

export const retailerKybReviewActions = [
  "approve",
  "reject",
  "request_resubmission",
] as const;

export class ReviewRetailerKybDto {
  @IsEnum(retailerKybReviewActions)
  action!: (typeof retailerKybReviewActions)[number];

  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  notes!: string;
}
