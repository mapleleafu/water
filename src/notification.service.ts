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
    const subscriptions = await this.prisma.subscription.findMany({
      include: { user: true },
    });
    this.logger.log(
      `Found ${subscriptions.length} subscriptions. Checking timezones...`,
    );

    const promises = subscriptions.map(async (sub) => {
      try {
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

        const notificationPayload = JSON.stringify({
          title: `Time to Hydrate, ${sub.user.name}! 💧`,
          body: 'Drink a glass of water now.',
          icon: '/icon.png',
          data: { secret: process.env.APP_SECRET },
          actions: [
            { action: 'drink', title: '✅ I Drank It' },
            { action: 'close', title: '❌ Snooze' },
          ],
        });

        // Cast to any for webPush since Prisma Json type might not match PushSubscription exactly
        await webPush.sendNotification(
          sub as unknown as webPush.PushSubscription,
          notificationPayload,
        );

        this.logger.log(
          `Sent to ${sub.endpoint} (Local time: ${currentHour}:00 in ${timeZone})`,
        );
      } catch (error: unknown) {
        const err = error as { statusCode?: number; message?: string };
        if (err.statusCode === 410) {
          this.logger.warn(`Subscription gone (410), deleting: ${sub.id}`);
          await this.prisma.subscription.delete({ where: { id: sub.id } });
        } else {
          this.logger.error(`Failed to send to ${sub.id}: ${err.message}`);
        }
      }
    });

    await Promise.all(promises);
    return { success: true, count: subscriptions.length };
  }
}
