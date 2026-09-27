import fs from 'node:fs';
import path from 'node:path';

export function resolvePublicKey(): string {
  if (process.env.JWT_PUBLIC_KEY) {
    return process.env.JWT_PUBLIC_KEY.trim();
  }

  if (process.env.JWT_PUBLIC_KEY_PATH && fs.existsSync(process.env.JWT_PUBLIC_KEY_PATH)) {
    return fs.readFileSync(process.env.JWT_PUBLIC_KEY_PATH, 'utf-8').trim();
  }

  const candidatePaths = [
    path.resolve(process.cwd(), 'keys/jwt-public.pem'),
    path.resolve(process.cwd(), '../keys/jwt-public.pem'),
    path.resolve(process.cwd(), '../../keys/jwt-public.pem'),
    '/app/keys/jwt-public.pem',
  ];

  for (const candidate of candidatePaths) {
    if (fs.existsSync(candidate)) {
      return fs.readFileSync(candidate, 'utf-8').trim();
    }
  }

  throw new Error(
    'Không tìm thấy JWT Public Key. Vui lòng cấu hình JWT_PUBLIC_KEY, JWT_PUBLIC_KEY_PATH hoặc chạy "pnpm run keys:generate".',
  );
}

export function resolvePrivateKey(): string {
  if (process.env.JWT_PRIVATE_KEY) {
    return process.env.JWT_PRIVATE_KEY.trim();
  }

  if (process.env.JWT_PRIVATE_KEY_PATH && fs.existsSync(process.env.JWT_PRIVATE_KEY_PATH)) {
    return fs.readFileSync(process.env.JWT_PRIVATE_KEY_PATH, 'utf-8').trim();
  }

  const candidatePaths = [
    path.resolve(process.cwd(), 'keys/jwt-private.pem'),
    path.resolve(process.cwd(), '../keys/jwt-private.pem'),
    path.resolve(process.cwd(), '../../keys/jwt-private.pem'),
    '/app/keys/jwt-private.pem',
  ];

  for (const candidate of candidatePaths) {
    if (fs.existsSync(candidate)) {
      return fs.readFileSync(candidate, 'utf-8').trim();
    }
  }

  throw new Error(
    'Không tìm thấy JWT Private Key cho Auth Service. Vui lòng cấu hình JWT_PRIVATE_KEY, JWT_PRIVATE_KEY_PATH hoặc chạy "pnpm run keys:generate".',
  );
}
