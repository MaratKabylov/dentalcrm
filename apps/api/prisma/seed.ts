import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { StandardRole, DEFAULT_ROLE_PERMISSIONS } from '@dentalcrm/contracts';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding Dental SaaS PostgreSQL database...');

  // 1. Create or get Tenant
  const tenant = await prisma.tenant.upsert({
    where: { subdomain: 'dentalux' },
    update: {},
    create: {
      name: 'DentaLux Клиник Казахстан',
      subdomain: 'dentalux',
      status: 'ACTIVE',
      settings: {
        create: {
          timezone: 'Asia/Almaty',
          currency: 'KZT',
          locale: 'ru',
        },
      },
    },
  });

  console.log(`Tenant created: ${tenant.name} (${tenant.id})`);

  // 2. Seed Permissions and Roles
  for (const [roleCode, permissions] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
    const role = await prisma.role.upsert({
      where: {
        tenantId_code: {
          tenantId: tenant.id,
          code: roleCode,
        },
      },
      update: {},
      create: {
        tenantId: tenant.id,
        name: roleCode.replace('_', ' '),
        code: roleCode,
        isSystem: true,
      },
    });

    for (const permKey of permissions) {
      const permission = await prisma.permission.upsert({
        where: { key: permKey },
        update: {},
        create: {
          key: permKey,
          domain: permKey.split('.')[0],
          description: `Permission for ${permKey}`,
        },
      });

      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId: permission.id,
          },
        },
        update: {},
        create: {
          roleId: role.id,
          permissionId: permission.id,
        },
      });
    }
  }

  // 3. Create Superadmin / Clinic Owner User
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash('AdminSecurePass2026!', salt);

  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@dentalcrm.kz' },
    update: {},
    create: {
      email: 'admin@dentalcrm.kz',
      passwordHash,
      firstName: 'Мурат',
      lastName: 'Ахметов',
      phone: '+7 701 555 12 34',
      iin: '850614300456',
      isActive: true,
      mfaEnabled: false,
    },
  });

  const membership = await prisma.membership.upsert({
    where: {
      tenantId_userId: {
        tenantId: tenant.id,
        userId: adminUser.id,
      },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      userId: adminUser.id,
      status: 'ACTIVE',
    },
  });

  const ownerRole = await prisma.role.findFirst({
    where: { tenantId: tenant.id, code: StandardRole.CLINIC_OWNER },
  });

  if (ownerRole) {
    await prisma.membershipRole.upsert({
      where: {
        membershipId_roleId: {
          membershipId: membership.id,
          roleId: ownerRole.id,
        },
      },
      update: {},
      create: {
        membershipId: membership.id,
        roleId: ownerRole.id,
      },
    });
  }

  // 4. Create Organization and Branches
  const org = await prisma.organization.create({
    data: {
      tenantId: tenant.id,
      name: 'ТОО "DentaLux Kazakhstan"',
      bin: '210440028912',
      legalAddress: 'г. Алматы, пр. Аль-Фараби 19',
    },
  });

  const branchSamal = await prisma.branch.create({
    data: {
      tenantId: tenant.id,
      organizationId: org.id,
      name: 'Филиал Самал',
      code: 'SML',
      city: 'Алматы',
      address: 'мкр. Самал-2, д. 45',
      phone: '+7 727 333 44 55',
    },
  });

  const roomTherapy = await prisma.room.create({
    data: {
      tenantId: tenant.id,
      branchId: branchSamal.id,
      name: 'Кабинет терапии 101',
      number: '101',
      floor: '1 этаж',
    },
  });

  await prisma.chair.createMany({
    data: [
      {
        tenantId: tenant.id,
        branchId: branchSamal.id,
        roomId: roomTherapy.id,
        name: 'Кресло Planmeca Compact i5 #1',
        code: 'SML-CH-01',
        status: 'OPERATIONAL',
        isAvailableForBooking: true,
      },
      {
        tenantId: tenant.id,
        branchId: branchSamal.id,
        roomId: roomTherapy.id,
        name: 'Кресло Kavo Primus #2',
        code: 'SML-CH-02',
        status: 'OPERATIONAL',
        isAvailableForBooking: true,
      },
      {
        tenantId: tenant.id,
        branchId: branchSamal.id,
        roomId: roomTherapy.id,
        name: 'Кресло Sirona Intego #3',
        code: 'SML-CH-03',
        status: 'MAINTENANCE',
        isAvailableForBooking: false,
      },
    ],
  });

  console.log('Database seeded successfully with Tenant, Roles, Admin User, Branches, and Chairs!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
