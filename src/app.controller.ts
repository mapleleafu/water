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
  Param,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { ApiKeyGuard } from './auth.guard';
import { PrismaService } from './prisma.service';
import { CreateSubscriptionDto } from './create-subscription.dto';
import { CreateUserDto } from './create-user.dto';
import { LogDrinkDto } from './log-drink.dto';
import { NotificationService } from './notification.service';
import { ValidateAppSecretDto } from './validate-app-secret.dto';

@Controller()
export class AppController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {}

  @Get('users')
  @UseGuards(ApiKeyGuard)
  async getUsers() {
    return await this.prisma.user.findMany({
      orderBy: { createdAt: 'asc' },
    });
  }

  @Post('users')
  @UseGuards(ApiKeyGuard)
  @UsePipes(new ValidationPipe())
  async createUser(@Body() body: CreateUserDto) {
    try {
      return await this.prisma.user.create({
        data: { name: body.name },
      });
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Username already taken');
      }
      throw error;
    }
  }

  @Get('stats/:userId')
  @UseGuards(ApiKeyGuard)
  async getStats(@Param('userId') userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const now = new Date();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(now.getDate() - 7);

    const logs = await this.prisma.drinkLog.findMany({
      where: {
        userId,
        timestamp: {
          gte: sevenDaysAgo,
        },
      },
      orderBy: { timestamp: 'asc' },
    });

    const history: Record<string, number> = {};
    let todayTotal = 0;
    const todayStr = now.toISOString().split('T')[0];

    logs.forEach((log) => {
      const dateStr = log.timestamp.toISOString().split('T')[0];
      if (!history[dateStr]) history[dateStr] = 0;
      history[dateStr] += log.amount;

      if (dateStr === todayStr) {
        todayTotal += log.amount;
      }
    });

    const graphData: { date: string; day: string; amount: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(now.getDate() - i);
      const ds = d.toISOString().split('T')[0];
      graphData.push({
        date: ds,
        day: d.toLocaleDateString('en-US', { weekday: 'short' }),
        amount: history[ds] || 0,
      });
    }

    return {
      todayTotal,
      history: graphData,
    };
  }

  @Post('subscribe')
  @UseGuards(ApiKeyGuard)
  @UsePipes(new ValidationPipe())
  async subscribe(@Body() body: CreateSubscriptionDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: body.userId },
    });
    if (!user) throw new NotFoundException('User not found');

    return await this.prisma.subscription.upsert({
      where: { endpoint: body.endpoint },
      update: {
        keys: body.keys,
        timezone: body.timezone,
        user: { connect: { id: body.userId } },
      },
      create: {
        endpoint: body.endpoint,
        keys: body.keys,
        timezone: body.timezone,
        user: { connect: { id: body.userId } },
      },
    });
  }

  @Post('log-drink')
  @UseGuards(ApiKeyGuard)
  @UsePipes(new ValidationPipe())
  async logDrink(@Body() body: LogDrinkDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: body.userId },
    });
    if (!user) throw new NotFoundException('User not found');

    return await this.prisma.drinkLog.create({
      data: {
        amount: body.amount,
        user: { connect: { id: body.userId } },
      },
    });
  }

  @Get('trigger-reminders')
  async triggerReminders(@Headers('authorization') authHeader: string) {
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      throw new UnauthorizedException('Invalid Cron Secret');
    }
    return await this.notificationService.sendWaterReminders();
  }

  @Post('validate-app-secret')
  @UsePipes(new ValidationPipe())
  validateAppSecret(@Body() body: ValidateAppSecretDto) {
    if (!process.env.APP_SECRET) {
      throw new UnauthorizedException('App secret is not configured on server');
    }

    if (body.secret !== process.env.APP_SECRET) {
      throw new UnauthorizedException('Invalid app secret');
    }

    return { valid: true };
  }
}
