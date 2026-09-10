import { PrismaClient } from '@prisma/client';
import { DomainEventType } from '@dentalcrm/contracts';

const prisma = new PrismaClient();

async function processOutboxEvent(event: any) {
  console.log(`[Worker] Processing event ${event.id}: [${event.eventName}] for tenant [${event.tenantId}]`);

  switch (event.eventName) {
    case DomainEventType.TENANT_CREATED:
      console.log(`[Worker] -> Welcome email queued for owner: ${event.payload?.ownerEmail}`);
      break;

    case DomainEventType.USER_CREATED:
      console.log(`[Worker] -> Provisioning user workspace: ${event.payload?.email} with role: ${event.payload?.role}`);
      break;

    case DomainEventType.USER_LOGGED_IN:
      console.log(`[Worker] -> Security check: user login recorded from IP: ${event.payload?.ip}`);
      break;

    case DomainEventType.ORGANIZATION_CREATED:
    case DomainEventType.BRANCH_CREATED:
    case DomainEventType.CHAIR_CREATED:
      console.log(`[Worker] -> Resource topology updated: ${event.eventName}`);
      break;

    default:
      console.log(`[Worker] -> Handled event: ${event.eventName}`);
      break;
  }

  // Mark event as PUBLISHED
  await prisma.outboxEvent.update({
    where: { id: event.id },
    data: {
      status: 'PUBLISHED',
      publishedAt: new Date(),
    },
  });

  console.log(`[Worker] Event ${event.id} marked as PUBLISHED`);
}

async function runWorkerLoop() {
  console.log('[Worker] Outbox worker started. Polling pending events...');

  setInterval(async () => {
    try {
      const pendingEvents = await prisma.outboxEvent.findMany({
        where: {
          status: 'PENDING',
          scheduledAt: { lte: new Date() },
        },
        orderBy: { scheduledAt: 'asc' },
        take: 20,
      });

      for (const event of pendingEvents) {
        try {
          await processOutboxEvent(event);
        } catch (err: any) {
          console.error(`[Worker] Failed to process event ${event.id}: ${err.message}`);
          await prisma.outboxEvent.update({
            where: { id: event.id },
            data: {
              status: 'FAILED',
              lastError: err.message,
              retryCount: { increment: 1 },
            },
          });
        }
      }
    } catch (err: any) {
      // Ignore connection errors if database is starting up
    }
  }, 2000);
}

runWorkerLoop().catch(console.error);
