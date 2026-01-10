import { IsString, IsNotEmpty, IsInt, Min, Max } from 'class-validator';

export class UpdatePreferencesDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsInt()
  @Min(0)
  @Max(23)
  quietStart: number;

  @IsInt()
  @Min(0)
  @Max(23)
  quietEnd: number;
}
