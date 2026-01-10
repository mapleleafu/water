import { IsString, IsNotEmpty, IsNumber, Min } from 'class-validator';

export class MuteRemindersDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsNumber()
  @Min(0)
  hours: number;
}
