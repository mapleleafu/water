import { IsNotEmpty, IsString } from 'class-validator';

export class ValidateAppSecretDto {
  @IsString()
  @IsNotEmpty()
  secret: string;
}
