import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers['x-api-key'];

    if (authHeader !== process.env.APP_SECRET) {
      throw new UnauthorizedException('Wrong secret code');
    }

    return true;
  }
}
