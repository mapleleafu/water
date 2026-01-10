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
  Query,
} from '@nestjs/common';
import { ApiKeyGuard } from './auth.guard';
import { PrismaService } from './prisma.service';
import { CreateSubscriptionDto } from './create-subscription.dto';
import { CreateUserDto } from './create-user.dto';
import { LogDrinkDto } from './log-drink.dto';
import { MuteRemindersDto } from './mute-reminders.dto';
import { UpdatePreferencesDto } from './update-preferences.dto';
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

  @Post('mute')
  @UseGuards(ApiKeyGuard)
  @UsePipes(new ValidationPipe())
  async muteReminders(@Body() body: MuteRemindersDto) {
    const user = await this.prisma.user.findUnique({ where: { id: body.userId } });
    if (!user) throw new NotFoundException('User not found');

    const until = new Date();
    until.setHours(until.getHours() + body.hours);

    await this.prisma.subscription.updateMany({
      where: { userId: body.userId },
      data: { mutedUntil: until },
    });

    return { mutedUntil: until };
  }

  @Post('preferences')
  @UseGuards(ApiKeyGuard)
  @UsePipes(new ValidationPipe())
  async updatePreferences(@Body() body: UpdatePreferencesDto) {
    const user = await this.prisma.user.findUnique({ where: { id: body.userId } });
    if (!user) throw new NotFoundException('User not found');

    await this.prisma.subscription.updateMany({
      where: { userId: body.userId },
      data: {
        quietStart: body.quietStart,
        quietEnd: body.quietEnd,
      },
    });

    return { success: true };
  }

  @Get('stats/:userId')
  @UseGuards(ApiKeyGuard)
  async getStats(
    @Param('userId') userId: string,
    @Query('goal') goalQuery?: string,
  ) {
    const user = await this.prisma.user.findUnique({ 
      where: { id: userId },
      include: {
        subscriptions: {
          take: 1,
          orderBy: { createdAt: 'desc' }
        }
      }
    });
    if (!user) throw new NotFoundException('User not found');

    const goal = parseInt(goalQuery || '2000', 10);
    const now = new Date();
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(now.getDate() - 90);

    const logs = await this.prisma.drinkLog.findMany({
      where: {
        userId,
        timestamp: {
          gte: ninetyDaysAgo,
        },
      },
      orderBy: { timestamp: 'asc' },
    });
    
    const totalLogs = await this.prisma.drinkLog.count({ where: { userId } });

    const history: Record<string, number> = {};
    const hourly: Record<number, number> = {}; // 0-23
    let todayTotal = 0;
    const todayStr = now.toISOString().split('T')[0];

    // Initialize hourly buckets
    for (let i = 0; i < 24; i++) hourly[i] = 0;

    logs.forEach((log) => {
      const dateStr = log.timestamp.toISOString().split('T')[0];
      if (!history[dateStr]) history[dateStr] = 0;
      history[dateStr] += log.amount;

      const hour = log.timestamp.getHours();
      hourly[hour] += log.amount;

      if (dateStr === todayStr) {
        todayTotal += log.amount;
      }
    });

    // --- Streak Calculation ---
    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;
    let daysMetGoal = 0;
    let totalDaysTracked = 0;

    const heatmapData: { date: string; amount: number; met: boolean }[] = [];

    for (let i = 89; i >= 0; i--) {
      const d = new Date();
      d.setDate(now.getDate() - i);
      const ds = d.toISOString().split('T')[0];
      const amount = history[ds] || 0;
      const met = amount >= goal;

      if (met) {
        tempStreak++;
        daysMetGoal++;
      } else {
        longestStreak = Math.max(longestStreak, tempStreak);
        tempStreak = 0;
      }
      
      if (amount > 0) totalDaysTracked++;

      heatmapData.push({ date: ds, amount, met });
    }
    longestStreak = Math.max(longestStreak, tempStreak);

    const todayMet = (history[todayStr] || 0) >= goal;
    if (todayMet) {
      currentStreak = 1;
      for (let i = 1; i < 90; i++) {
        const d = new Date();
        d.setDate(now.getDate() - i);
        const ds = d.toISOString().split('T')[0];
        if ((history[ds] || 0) >= goal) {
          currentStreak++;
        } else {
          break;
        }
      }
    } else {
      const d = new Date();
      d.setDate(now.getDate() - 1);
      const prevStr = d.toISOString().split('T')[0];
      if ((history[prevStr] || 0) >= goal) {
         currentStreak = 0;
         for (let i = 1; i < 90; i++) {
            const d2 = new Date();
            d2.setDate(now.getDate() - i);
            const ds = d2.toISOString().split('T')[0];
            if ((history[ds] || 0) >= goal) {
              currentStreak++;
            } else {
              break;
            }
         }
      } else {
        currentStreak = 0;
      }
    }

    const weeklyGraph: { date: string; day: string; amount: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(now.getDate() - i);
      const ds = d.toISOString().split('T')[0];
      weeklyGraph.push({
        date: ds,
        day: d.toLocaleDateString('en-US', { weekday: 'short' }),
        amount: history[ds] || 0,
      });
    }
    
    const average = totalDaysTracked > 0 ? Object.values(history).reduce((a,b) => a+b, 0) / totalDaysTracked : 0;

    return {
      todayTotal,
      currentStreak,
      longestStreak,
      totalLogs,
      completionRate: Math.round((daysMetGoal / 90) * 100),
      averageDaily: Math.round(average),
      history: weeklyGraph,
      heatmap: heatmapData,
      hourly: Object.entries(hourly).map(([h, v]) => ({ hour: parseInt(h), amount: v })),
      preferences: user.subscriptions[0] ? {
        quietStart: user.subscriptions[0].quietStart,
        quietEnd: user.subscriptions[0].quietEnd,
      } : { quietStart: 22, quietEnd: 8 }
    };
  }

  @Get('stats/:userId/day/:date')
  @UseGuards(ApiKeyGuard)
  async getDayDetails(
    @Param('userId') userId: string,
    @Param('date') date: string,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const startOfDay = new Date(date);
    const endOfDay = new Date(date);
    endOfDay.setDate(endOfDay.getDate() + 1);

    const logs = await this.prisma.drinkLog.findMany({
      where: {
        userId,
        timestamp: {
          gte: startOfDay,
          lt: endOfDay,
        },
      },
      orderBy: { timestamp: 'asc' },
    });

    return logs;
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

  @Get('force-reminders')
  async forceReminders(@Headers('authorization') authHeader: string) {
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      throw new UnauthorizedException('Invalid Cron Secret');
    }
    return await this.notificationService.sendWaterReminders(true);
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
