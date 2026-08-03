import { IsBoolean, IsIn, IsOptional, Matches } from "class-validator";

const severities = ["info", "success", "warning", "critical"] as const;

export class UpdateNotificationPreferencesDto {
  @IsBoolean()
  soundEnabled!: boolean;

  @IsIn(severities)
  soundMinimumSeverity!: (typeof severities)[number];

  @IsBoolean()
  emailEnabled!: boolean;

  @IsIn(severities)
  emailMinimumSeverity!: (typeof severities)[number];

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  quietHoursStart?: string;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  quietHoursEnd?: string;
}
