import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import type { AuthClaims, Role } from '../types';
import { UnauthorizedError } from '../errors';

export async function hashPassword(plain: string, rounds: number): Promise<string> {
  return bcrypt.hash(plain, rounds);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function signAccessToken(claims: AuthClaims, secret: string, expiresIn = '8h'): string {
  const options: SignOptions = {
    algorithm: 'HS256',
    expiresIn: expiresIn as SignOptions['expiresIn'],
  };
  return jwt.sign(claims, secret, options);
}

export function verifyAccessToken(token: string, secret: string): AuthClaims {
  try {
    const decoded = jwt.verify(token, secret);
    if (typeof decoded !== 'object' || decoded === null) {
      throw new UnauthorizedError('Invalid token');
    }
    const { sub, email, role, workspaceId } = decoded as AuthClaims;
    if (!sub || !email || !role || !workspaceId) {
      throw new UnauthorizedError('Invalid token claims');
    }
    return { sub, email, role: role as Role, workspaceId };
  } catch (err) {
    if (err instanceof UnauthorizedError) throw err;
    throw new UnauthorizedError('Invalid or expired token');
  }
}

export function generateApprovalToken(): string {
  return randomBytes(32).toString('hex');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function tokensMatch(plain: string, hashed: string): boolean {
  const left = Buffer.from(hashToken(plain));
  const right = Buffer.from(hashed);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function canRead(_role: Role): boolean {
  return true;
}

export function canOperate(role: Role): boolean {
  return role === 'admin' || role === 'operator';
}

export function canApprove(role: Role): boolean {
  return role === 'admin';
}

export function canExecute(role: Role): boolean {
  return role === 'admin' || role === 'operator';
}
