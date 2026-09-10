import { PrismaService } from '../src/common/prisma/prisma.service';

describe('Tenant Isolation Unit & Architecture Test', () => {
  let prismaService: PrismaService;

  beforeEach(() => {
    prismaService = new PrismaService();
  });

  it('should allow entity access when tenantId matches the auth context', () => {
    const tenantA = 'tenant-uuid-1111';
    const mockBranch = {
      id: 'branch-1',
      tenantId: tenantA,
      name: 'Samal Branch',
    };

    const result = prismaService.ensureTenantScope(mockBranch, tenantA);
    expect(result).toBeDefined();
    expect(result?.tenantId).toBe(tenantA);
  });

  it('should throw security violation error when Tenant A attempts to access Tenant B resource', () => {
    const tenantA = 'tenant-uuid-1111';
    const tenantB = 'tenant-uuid-2222';
    const mockBranchOfTenantB = {
      id: 'branch-2',
      tenantId: tenantB,
      name: 'Astana Branch',
    };

    expect(() => {
      prismaService.ensureTenantScope(mockBranchOfTenantB, tenantA);
    }).toThrow(/Tenant isolation violation/);
  });

  it('should return null safely if entity does not exist', () => {
    const result = prismaService.ensureTenantScope(null, 'tenant-123');
    expect(result).toBeNull();
  });
});
