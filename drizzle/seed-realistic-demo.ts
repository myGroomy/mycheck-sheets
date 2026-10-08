/**
 * Additive, idempotent demo fixture for three branches and shared staff.
 * Run from the repository root with: npx tsx apps/web/drizzle/seed-realistic-demo.ts
 */
import 'dotenv/config';
import { and, eq, inArray, notInArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { ulid } from 'ulid';
import { hashPin } from '../lib/_deprecated-auth/pin';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;
const pinPepper = process.env.PIN_PEPPER;

if (!connectionString) {
  throw new Error('DATABASE_URL tidak ada di environment');
}
if (!pinPepper) {
  throw new Error('PIN_PEPPER tidak ada di environment');
}

const sql = postgres(connectionString, { connect_timeout: 10, max: 1 });
const db = drizzle(sql, { schema });

const branchSpecs = [
  {
    code: 'JKT01',
    name: 'Jakarta Selatan',
    address: 'Jl. Panglima Polim No. 18, Jakarta Selatan',
  },
  {
    code: 'BDG01',
    name: 'Bandung Dago',
    address: 'Jl. Ir. H. Juanda No. 64, Bandung',
  },
  {
    code: 'BGR01',
    name: 'Bogor Pajajaran',
    address: 'Jl. Pajajaran No. 22, Bogor',
  },
] as const;

const staffSpecs = [
  { username: 'demo.rani', name: 'Rani Wardani', branches: ['JKT01', 'BDG01'] },
  { username: 'demo.bagus', name: 'Bagus Pratama', branches: ['JKT01', 'BDG01'] },
  { username: 'demo.siti', name: 'Siti Rahma', branches: ['JKT01'] },
  { username: 'demo.andi', name: 'Andi Saputra', branches: ['JKT01'] },
  { username: 'demo.dimas', name: 'Dimas Kurniawan', branches: ['JKT01'] },
  { username: 'demo.putri', name: 'Putri Amelia', branches: ['BDG01', 'BGR01'] },
  { username: 'demo.farhan', name: 'Farhan Akbar', branches: ['BDG01', 'BGR01'] },
  { username: 'demo.nanda', name: 'Nanda Puspita', branches: ['BDG01'] },
  { username: 'demo.mega', name: 'Mega Lestari', branches: ['BGR01'] },
  { username: 'demo.arif', name: 'Arif Maulana', branches: ['BGR01'] },
  { username: 'demo.tiara', name: 'Tiara Anggraini', branches: ['BGR01'] },
] as const;

const shiftSpecs = [
  { name: 'Pagi', startTime: '07:00', endTime: '15:00', sortOrder: 1 },
  { name: 'Siang', startTime: '11:00', endTime: '19:00', sortOrder: 2 },
  { name: 'Malam', startTime: '15:00', endTime: '23:00', sortOrder: 3 },
] as const;

const categorySpecs = [
  {
    name: 'Kesiapan Outlet',
    points: [
      { title: 'Area layanan bersih dan siap digunakan', inputType: 'centang', targetTime: '07:30' },
      { title: 'Peralatan utama berfungsi normal', inputType: 'ok_tidak_ok', targetTime: '07:45' },
      { title: 'Foto kondisi area sebelum operasional', inputType: 'foto', targetTime: '08:00' },
    ],
  },
  {
    name: 'Keamanan Pangan',
    points: [
      { title: 'Suhu chiller dalam rentang aman', inputType: 'angka', targetTime: '08:00', numberMin: 0, numberMax: 5 },
      { title: 'Suhu freezer dalam rentang aman', inputType: 'angka', targetTime: '08:00', numberMin: -22, numberMax: -18 },
      { title: 'Label dan masa simpan bahan diperiksa', inputType: 'centang', targetTime: '08:15' },
    ],
  },
  {
    name: 'Kas dan Stok Harian',
    points: [
      { title: 'Kas awal dihitung dan dicatat', inputType: 'angka', targetTime: '07:15', numberMin: 0, numberMax: 10000000 },
      { title: 'Bahan kritis cukup untuk operasional', inputType: 'centang', targetTime: '08:30' },
      { title: 'Kendala stok atau alat dicatat untuk handover', inputType: 'teks', targetTime: '14:30' },
    ],
  },
] as const;

const handoverSpecs = [
  { label: 'Kas akhir / kas serah terima', fieldType: 'angka', isRequired: true },
  { label: 'Jumlah transaksi atau ringkasan penjualan', fieldType: 'teks', isRequired: true },
  { label: 'Kondisi stok bahan kritis', fieldType: 'pilihan', isRequired: true, options: ['Aman', 'Perlu restock', 'Habis'] },
  { label: 'Kondisi peralatan outlet', fieldType: 'pilihan', isRequired: true, options: ['Normal', 'Perlu perhatian', 'Rusak'] },
  { label: 'Catatan untuk shift berikutnya', fieldType: 'teks', isRequired: false },
] as const;

async function seed() {
  const pinHash = await hashPin('123456');

  const result = await db.transaction(async (tx) => {
    const now = new Date();
    const branchesByCode = new Map<string, string>();
    for (const branch of branchSpecs) {
      const [existing] = await tx
        .select({ id: schema.branches.id })
        .from(schema.branches)
        .where(eq(schema.branches.code, branch.code))
        .limit(1);

      if (existing) {
        await tx
          .update(schema.branches)
          .set({
            name: branch.name,
            address: branch.address,
            timezone: 'Asia/Jakarta',
            isActive: true,
            updatedAt: now,
          })
          .where(eq(schema.branches.id, existing.id));
        branchesByCode.set(branch.code, existing.id);
      } else {
        const id = ulid();
        await tx.insert(schema.branches).values({
          id,
          name: branch.name,
          code: branch.code,
          address: branch.address,
          timezone: 'Asia/Jakarta',
        });
        branchesByCode.set(branch.code, id);
      }
    }

    const [existingAdmin] = await tx
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.username, 'admin'))
      .limit(1);
    const adminId = existingAdmin?.id ?? ulid();
    if (!existingAdmin) {
      await tx.insert(schema.users).values({
        id: adminId,
        name: 'Admin',
        username: 'admin',
        pinHash,
        role: 'admin',
        mustChangePin: true,
      });
    }

    const usersByUsername = new Map<string, string>();
    for (const staff of staffSpecs) {
      const [existing] = await tx
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.username, staff.username))
        .limit(1);
      const userId = existing?.id ?? ulid();

      if (existing) {
        await tx
          .update(schema.users)
          .set({
            name: staff.name,
            role: 'petugas',
            isActive: true,
            updatedAt: now,
          })
          .where(eq(schema.users.id, userId));
      } else {
        await tx.insert(schema.users).values({
          id: userId,
          name: staff.name,
          username: staff.username,
          pinHash,
          role: 'petugas',
          mustChangePin: true,
        });
      }
      usersByUsername.set(staff.username, userId);

      for (const branchCode of staff.branches) {
        const branchId = branchesByCode.get(branchCode);
        if (!branchId) throw new Error(`Cabang fixture ${branchCode} tidak ditemukan`);

        await tx
          .insert(schema.userBranchAccess)
          .values({ id: ulid(), userId, branchId, grantedBy: adminId })
          .onConflictDoUpdate({
            target: [schema.userBranchAccess.userId, schema.userBranchAccess.branchId],
            set: { isActive: true, grantedBy: adminId, updatedAt: now },
          });
      }
    }

    for (const branchId of branchesByCode.values()) {
      await tx
        .insert(schema.userBranchAccess)
        .values({ id: ulid(), userId: adminId, branchId, grantedBy: adminId })
        .onConflictDoUpdate({
          target: [schema.userBranchAccess.userId, schema.userBranchAccess.branchId],
          set: { isActive: true, grantedBy: adminId, updatedAt: now },
        });
    }

    const legacyStaffAssignments = await tx
      .select({ id: schema.userBranchAccess.id })
      .from(schema.userBranchAccess)
      .innerJoin(schema.users, eq(schema.users.id, schema.userBranchAccess.userId))
      .where(and(
        inArray(schema.userBranchAccess.branchId, [...branchesByCode.values()]),
        eq(schema.userBranchAccess.isActive, true),
        eq(schema.users.role, 'petugas'),
        notInArray(schema.users.id, [...usersByUsername.values()])
      ));

    if (legacyStaffAssignments.length > 0) {
      await tx
        .update(schema.userBranchAccess)
        .set({ isActive: false, updatedAt: now })
        .where(inArray(
          schema.userBranchAccess.id,
          legacyStaffAssignments.map((assignment) => assignment.id)
        ));
    }

    const legacyBranchId = branchesByCode.get('BDG01');
    if (legacyBranchId) {
      const legacyShifts = await tx
        .select({ id: schema.shiftDefinitions.id })
        .from(schema.shiftDefinitions)
        .where(and(
          eq(schema.shiftDefinitions.branchId, legacyBranchId),
          inArray(schema.shiftDefinitions.name, ['Opening', 'Middle', 'Closing'])
        ));
      const legacyShiftIds = legacyShifts.map((shift) => shift.id);

      if (legacyShiftIds.length > 0) {
        await tx
          .update(schema.shiftDefinitions)
          .set({ isActive: false, updatedAt: now })
          .where(inArray(schema.shiftDefinitions.id, legacyShiftIds));

        const legacyCategories = await tx
          .select({ id: schema.sopCategories.id })
          .from(schema.sopCategories)
          .where(inArray(schema.sopCategories.shiftDefinitionId, legacyShiftIds));
        const legacyCategoryIds = legacyCategories.map((category) => category.id);

        if (legacyCategoryIds.length > 0) {
          await tx
            .update(schema.sopCategories)
            .set({ isActive: false, updatedAt: now })
            .where(inArray(schema.sopCategories.id, legacyCategoryIds));
          await tx
            .update(schema.checklistPoints)
            .set({ isActive: false, updatedAt: now })
            .where(inArray(schema.checklistPoints.sopCategoryId, legacyCategoryIds));
        }

        await tx
          .update(schema.handoverFields)
          .set({ isActive: false, updatedAt: now })
          .where(inArray(schema.handoverFields.shiftDefinitionId, legacyShiftIds));
      }
    }

    for (const branch of branchSpecs) {
      const branchId = branchesByCode.get(branch.code);
      if (!branchId) throw new Error(`Cabang fixture ${branch.code} tidak ditemukan`);

      for (const shift of shiftSpecs) {
        const [existingShift] = await tx
          .select({ id: schema.shiftDefinitions.id })
          .from(schema.shiftDefinitions)
          .where(and(
            eq(schema.shiftDefinitions.branchId, branchId),
            eq(schema.shiftDefinitions.name, shift.name)
          ))
          .limit(1);
        const shiftDefinitionId = existingShift?.id ?? ulid();

        if (existingShift) {
          await tx
            .update(schema.shiftDefinitions)
            .set({
              startTime: shift.startTime,
              endTime: shift.endTime,
              sortOrder: shift.sortOrder,
              isActive: true,
              updatedAt: now,
            })
            .where(eq(schema.shiftDefinitions.id, shiftDefinitionId));
        } else {
          await tx.insert(schema.shiftDefinitions).values({
            id: shiftDefinitionId,
            branchId,
            name: shift.name,
            startTime: shift.startTime,
            endTime: shift.endTime,
            sortOrder: shift.sortOrder,
          });
        }

        for (const [categoryIndex, category] of categorySpecs.entries()) {
          const [existingCategory] = await tx
            .select({ id: schema.sopCategories.id })
            .from(schema.sopCategories)
            .where(and(
              eq(schema.sopCategories.shiftDefinitionId, shiftDefinitionId),
              eq(schema.sopCategories.name, category.name)
            ))
            .limit(1);
          const categoryId = existingCategory?.id ?? ulid();

          if (existingCategory) {
            await tx
              .update(schema.sopCategories)
              .set({ sortOrder: categoryIndex + 1, isActive: true, updatedAt: now })
              .where(eq(schema.sopCategories.id, categoryId));
          } else {
            await tx.insert(schema.sopCategories).values({
              id: categoryId,
              shiftDefinitionId,
              name: category.name,
              sortOrder: categoryIndex + 1,
            });
          }

          for (const [pointIndex, point] of category.points.entries()) {
            const [existingPoint] = await tx
              .select({ id: schema.checklistPoints.id })
              .from(schema.checklistPoints)
              .where(and(
                eq(schema.checklistPoints.sopCategoryId, categoryId),
                eq(schema.checklistPoints.title, point.title)
              ))
              .limit(1);
            const pointValues = {
              instruction: `Periksa sesuai SOP outlet ${branch.name} pada shift ${shift.name}.`,
              inputType: point.inputType,
              isRequired: true,
              targetTime: point.targetTime,
              toleranceMinutes: 15,
              numberMin: 'numberMin' in point ? point.numberMin : null,
              numberMax: 'numberMax' in point ? point.numberMax : null,
              sortOrder: pointIndex + 1,
              isActive: true,
              updatedAt: now,
            };

            if (existingPoint) {
              await tx
                .update(schema.checklistPoints)
                .set(pointValues)
                .where(eq(schema.checklistPoints.id, existingPoint.id));
            } else {
              await tx.insert(schema.checklistPoints).values({
                id: ulid(),
                sopCategoryId: categoryId,
                title: point.title,
                ...pointValues,
              });
            }
          }
        }

        for (const [fieldIndex, field] of handoverSpecs.entries()) {
          const [existingField] = await tx
            .select({ id: schema.handoverFields.id })
            .from(schema.handoverFields)
            .where(and(
              eq(schema.handoverFields.shiftDefinitionId, shiftDefinitionId),
              eq(schema.handoverFields.label, field.label)
            ))
            .limit(1);
          const fieldValues = {
            fieldType: field.fieldType,
            isRequired: field.isRequired,
            options: 'options' in field ? [...field.options] : null,
            sortOrder: fieldIndex + 1,
            isActive: true,
            updatedAt: now,
          };

          if (existingField) {
            await tx
              .update(schema.handoverFields)
              .set(fieldValues)
              .where(eq(schema.handoverFields.id, existingField.id));
          } else {
            await tx.insert(schema.handoverFields).values({
              id: ulid(),
              shiftDefinitionId,
              label: field.label,
              ...fieldValues,
            });
          }
        }
      }
    }

    const incidentCategorySpecs = [
      'Peralatan dan fasilitas',
      'Keamanan pangan',
      'Layanan pelanggan',
      'Keselamatan kerja',
      'Selisih kas',
    ];
    for (const [index, name] of incidentCategorySpecs.entries()) {
      await tx
        .insert(schema.incidentCategories)
        .values({ id: ulid(), name, sortOrder: index + 1 })
        .onConflictDoUpdate({
          target: schema.incidentCategories.name,
          set: { sortOrder: index + 1, isActive: true, updatedAt: now },
        });
    }

    return {
      branches: branchesByCode.size,
      staff: usersByUsername.size,
      staffBranchAssignments: staffSpecs.reduce((total, staff) => total + staff.branches.length, 0),
      shifts: branchSpecs.length * shiftSpecs.length,
      deactivatedLegacyAssignments: legacyStaffAssignments.length,
    };
  });

  console.log(
    `Demo fixture siap: ${result.branches} cabang, ${result.staff} petugas unik, ` +
      `${result.staffBranchAssignments} penempatan petugas, ${result.shifts} definisi shift; ` +
      `${result.deactivatedLegacyAssignments} akses petugas lama dinonaktifkan.`
  );
  console.log('Akun fixture yang baru dibuat wajib mengganti PIN saat login pertama.');
}

seed()
  .catch((error: unknown) => {
    console.error('Seed fixture gagal:', error instanceof Error ? error.message : 'Kesalahan tidak diketahui');
    process.exitCode = 1;
  })
  .finally(async () => {
    await sql.end();
  });
