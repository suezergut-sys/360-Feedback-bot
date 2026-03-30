import bcrypt from "bcryptjs";

const BCRYPT_ROUNDS = 12;

export async function hashPassword(rawPassword: string): Promise<string> {
  return bcrypt.hash(rawPassword, BCRYPT_ROUNDS);
}

export async function verifyPassword(rawPassword: string, hash: string): Promise<boolean> {
  return bcrypt.compare(rawPassword, hash);
}
