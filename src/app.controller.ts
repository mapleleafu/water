import {
  Get,
  Post,
  Body,
  Controller,
  UseGuards,
  UsePipes,
  ValidationPipe,
  UnauthorizedException,
  Headers,
} from '@nestjs/common';
import { ApiKeyGuard } from './auth.guard';
import { PrismaService } from './prisma.service';
import { CreateSubscriptionDto } from './create-subscription.dto';
import { NotificationService } from './notification.service';

@Controller()
export class AppController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {}
  @Post('subscribe')
  @UseGuards(ApiKeyGuard)
  @UsePipes(new ValidationPipe())
  async subscribe(@Body() body: CreateSubscriptionDto) {
    return this.prisma.subscription.upsert({
      where: { endpoint: body.endpoint },
      update: {
        keys: body.keys,
        timezone: body.timezone,
      },
      create: {
        endpoint: body.endpoint,
        keys: body.keys,
        timezone: body.timezone,
      },
    });
  }

  @Post('log-drink')
  @UseGuards(ApiKeyGuard)
  async logDrink() {
    return this.prisma.drinkLog.create({
      data: {}, // Timestamp is automatic
    });
  }

  @Get('trigger-reminders')
  async triggerReminders(@Headers('authorization') authHeader: string) {
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      throw new UnauthorizedException('Invalid Cron Secret');
    }
    return this.notificationService.sendWaterReminders();
  }
}
