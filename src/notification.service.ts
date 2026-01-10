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

  async sendWaterReminders(disregardTime = false) {
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

        if (sub.mutedUntil && new Date() < new Date(sub.mutedUntil)) {
          this.logger.log(
            `Skipping ${sub.endpoint} - Muted until ${sub.mutedUntil}`,
          );
          return;
        }

        // Check quiet hours
        const isQuiet = sub.quietStart > sub.quietEnd
          ? (currentHour >= sub.quietStart || currentHour < sub.quietEnd) // e.g. 22 to 8
          : (currentHour >= sub.quietStart && currentHour < sub.quietEnd); // e.g. 8 to 22 (unlikely but possible)

        if (!disregardTime && isQuiet) {
          this.logger.log(
            `Skipping ${sub.endpoint} - Local time is ${currentHour}:00 (Quiet hours: ${sub.quietStart}-${sub.quietEnd} in ${timeZone})`,
          );
          return;
        }

        const notificationPayload = JSON.stringify({
          title: `Time to Hydrate, ${sub.user.name}! 💧`,
          body: 'Drink a glass of water now.',
          icon: '/icon.png',
          data: { 
            secret: process.env.APP_SECRET,
            userId: sub.user.id
          },
          actions: [{ action: 'drink', title: '✅ I Drank It' }],
        });

        await webPush.sendNotification(
          sub as unknown as webPush.PushSubscription,
          notificationPayload,
          {
            urgency: 'high',
            TTL: 60 * 60 * 24,
          },
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
