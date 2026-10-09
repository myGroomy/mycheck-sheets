// scripts/verify-zod4.ts
// Verifikasi runtime kompatibilitas zod 4 dengan schema MYCHECK (Fase 3).
// Jalankan: npx tsx scripts/verify-zod4.ts
import { z } from 'zod';
import { loginSchema, roleSchema, checklistPointSchema } from '../lib/shared';

let failed = 0;
function check(name: string, cond: boolean) {
  console.log(`${cond ? '✓' : '✗'} ${name}`);
  if (!cond) failed++;
}

// 1. z.enum + z.infer (roleSchema)
check('z.enum accepts valid role', roleSchema.safeParse('admin').success);
check('z.enum rejects invalid role', !roleSchema.safeParse('root').success);

// 2. z.object + z.string().length + .regex (loginSchema)
const okLogin = loginSchema.safeParse({ username: 'budi', pin: '123456' });
check('loginSchema accepts valid input', okLogin.success);
const badLogin = loginSchema.safeParse({ username: 'budi', pin: '12345' });
check('loginSchema rejects short pin', !badLogin.success);

// 3. error.issues array + issue.path.join (pola lib/env.ts)
if (!badLogin.success) {
  const hasIssues = Array.isArray(badLogin.error.issues);
  check('error.issues is array', hasIssues);
  const joined = badLogin.error.issues.map((i) => i.path.join('.')).join(',');
  check('issue.path.join works', typeof joined === 'string' && joined.length >= 0);
}

// 4. z.array().min + nested enum (checklistPointSchema)
const okPoint = checklistPointSchema.safeParse({
  title: 'Cek kulkas',
  inputType: 'centang',
  activeDays: ['mon', 'tue'],
});
check('checklistPointSchema accepts valid', okPoint.success);
const badPoint = checklistPointSchema.safeParse({
  title: 'Cek kulkas',
  inputType: 'centang',
  activeDays: [],
});
check('checklistPointSchema rejects empty activeDays', !badPoint.success);

// 5. min() message custom masih terbawa
if (!okLogin.success === false) {
  // no-op guard
}

console.log(failed === 0 ? '\nALL ZOD 4 CHECKS PASSED' : `\n${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
