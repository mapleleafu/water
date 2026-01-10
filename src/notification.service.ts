import { Injectable, Logger } from '@nestjs/common';
import * as webPush from 'web-push';
import { PrismaService } from './prisma.service';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(private prisma: PrismaService) {
    webPush.setVapidDetails(
      process.env.VAPID_SUBJECT!,
      process.env.VAPID_PUBLIC!,
      process.env.VAPID_PRIVATE!,
    );
  }

  async sendWaterReminders() {
    const subscriptions = await this.prisma.subscription.findMany();
    this.logger.log(
      `Found ${subscriptions.length} subscriptions. Checking timezones...`,
    );

    const notificationPayload = JSON.stringify({
      title: 'Time to Hydrate! 💧',
      body: 'Drink a glass of water now.',
      icon: '/icon.png',
      data: { secret: process.env.APP_SECRET },
      actions: [
        { action: 'drink', title: '✅ I Drank It' },
        { action: 'close', title: '❌ Snooze' },
      ],
    });

    const promises = subscriptions.map(async (sub) => {
      try {
        // 1. Get User's Local Hour (0-23)
        // We use 'en-US' + hour12:false to get a clean "14" or "09" integer string
        // If timezone is somehow missing, default to UTC
        const timeZone = sub.timezone || 'UTC';

        const localTime = new Date().toLocaleString('en-US', {
          timeZone,
          hour: 'numeric',
          hour12: false,
        });

        const currentHour = parseInt(localTime, 10);

        if (currentHour < 8 || currentHour > 22) {
          this.logger.log(
            `Skipping ${sub.endpoint} - Local time is ${currentHour}:00 (Sleeping in ${timeZone})`,
          );
          return;
        }

        await webPush.sendNotification(sub as any, notificationPayload);

        this.logger.log(
          `Sent to ${sub.endpoint} (Local time: ${currentHour}:00 in ${timeZone})`,
        );
      } catch (error: any) {
        // TODO: remind the user to re-subscribe if 410 Gone
        if (error.statusCode === 410) {
          this.logger.warn(`Subscription gone (410), deleting: ${sub.id}`);
          await this.prisma.subscription.delete({ where: { id: sub.id } });
        } else {
          this.logger.error(`Failed to send to ${sub.id}: ${error.message}`);
        }
      }
    });

    await Promise.all(promises);
    return { success: true, count: subscriptions.length };
  }
}
