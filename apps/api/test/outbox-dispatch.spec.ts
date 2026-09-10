import { OutboxService } from '../src/modules/outbox/outbox.service';
import { DomainEventType } from '@dentalcrm/contracts';

describe('Transactional Outbox Specification', () => {
  let outboxService: OutboxService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      outboxEvent: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'evt-1', ...data })),
        update: jest.fn().mockImplementation(({ where, data }) => Promise.resolve({ id: where.id, ...data })),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    outboxService = new OutboxService(mockPrisma);
  });

  it('should enqueue a domain event in PENDING status', async () => {
    const tenantId = 'tenant-100';
    const payload = { name: 'DentaLux Almaty', ownerEmail: 'owner@dentalux.kz' };

    const result = await outboxService.enqueueEvent(tenantId, DomainEventType.TENANT_CREATED, payload);

    expect(mockPrisma.outboxEvent.create).toHaveBeenCalledWith({
      data: {
        tenantId,
        eventName: DomainEventType.TENANT_CREATED,
        payload,
        status: 'PENDING',
      },
    });
    expect(result.status).toBe('PENDING');
  });

  it('should mark event as PUBLISHED upon successful worker processing', async () => {
    const eventId = 'evt-123';
    await outboxService.markPublished(eventId);

    expect(mockPrisma.outboxEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: eventId },
        data: expect.objectContaining({
          status: 'PUBLISHED',
        }),
      }),
    );
  });

  it('should mark event as FAILED and increment retry count if worker fails', async () => {
    const eventId = 'evt-456';
    const errorMessage = 'Network timeout contacting external webhook';

    await outboxService.markFailed(eventId, errorMessage);

    expect(mockPrisma.outboxEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: eventId },
        data: expect.objectContaining({
          status: 'FAILED',
          lastError: errorMessage,
        }),
      }),
    );
  });
});
