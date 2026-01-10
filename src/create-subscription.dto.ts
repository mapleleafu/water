import { IsNotEmpty, IsObject, IsString } from 'class-validator';

export class CreateSubscriptionDto {
  @IsString()
  @IsNotEmpty()
  endpoint: string;

  @IsObject()
  keys: {
    p256dh: string;
    auth: string;
  };

  @IsString()
  @IsNotEmpty()
  timezone: string;
}
