import { argon2, randomBytes, timingSafeEqual } from 'node:crypto';

const derive = (password: string, salt: Buffer) => new Promise<Buffer>((resolve, reject) => {
  argon2('argon2id', { message: password, nonce: salt, memory: 19456, passes: 2, parallelism: 1, tagLength: 32 },
    (error, key) => error ? reject(error) : resolve(key));
});
export async function hashPassword(password: string) {
  const salt = randomBytes(16), key = await derive(password, salt);
  return `argon2id:19456:2:1:${salt.toString('hex')}:${key.toString('hex')}`;
}
export async function verifyPassword(password: string, encoded?: string) {
  const parts = encoded?.split(':');
  const valid = parts?.length === 6 && parts.slice(0, 4).join(':') === 'argon2id:19456:2:1';
  const salt = valid ? Buffer.from(parts![4], 'hex') : Buffer.alloc(16);
  const actual = await derive(password, salt), expected = valid ? Buffer.from(parts![5], 'hex') : Buffer.alloc(32);
  return !!valid && actual.length === expected.length && timingSafeEqual(actual, expected);
}
