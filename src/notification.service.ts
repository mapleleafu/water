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
    this.logger.log(`Found ${subscriptions.length} subscriptions.`);

    const notificationPayload = JSON.stringify({
      title: 'Time to Hydrate! 💧',
      body: 'Drink a glass of water now.',
      icon: '/icon.png',
    });

    const promises = subscriptions.map(async (sub) => {
      try {
        await webPush.sendNotification(sub as any, notificationPayload);
        this.logger.log(`Sent to ${sub.endpoint}`);
      } catch (error) {
        if (error.statusCode === 410) {
          this.logger.warn(`Subscription gone, deleting: ${sub.id}`);
          await this.prisma.subscription.delete({ where: { id: sub.id } });
        } else {
          this.logger.error(`Error sending to ${sub.id}:`, error);
        }
      }
    });

    await Promise.all(promises);
    return { success: true, count: subscriptions.length };
  }
}
