import { Buffer } from 'node:buffer';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

const androidFirebaseConfig = z.object({
  project_info: z.object({ project_id: z.string().min(1), project_number: z.string().min(1) }),
  client: z.array(z.object({
    client_info: z.object({
      mobilesdk_app_id: z.string().min(1),
      android_client_info: z.object({ package_name: z.string().min(1) }),
    }),
    api_key: z.array(z.object({ current_key: z.string().min(1) })).min(1),
  })).min(1),
});

/** Build-time only: never import this module from src or expose Base64 through Expo extra. */
export function resolveGoogleServicesFile(options: {
  projectRoot: string;
  androidPackage: string;
  base64?: string;
  filePath?: string;
}): string | undefined {
  const { projectRoot, androidPackage, base64, filePath } = options;
  if (!base64?.trim()) {
    if (filePath)
      return filePath;
    const local = path.join(projectRoot, 'google-services.json');
    return existsSync(local) ? local : undefined;
  }

  const encoded = base64.replace(/\s/g, '');
  if (!/^[\w+/]+={0,2}$/.test(encoded) || encoded.length % 4 !== 0) {
    throw new Error('GOOGLE_SERVICES_JSON_BASE64 không phải Base64 hợp lệ. Hãy mã hoá lại file google-services.json.');
  }
  const decoded = Buffer.from(encoded, 'base64');
  if (decoded.toString('base64') !== encoded) {
    throw new Error('GOOGLE_SERVICES_JSON_BASE64 không phải Base64 hợp lệ.');
  }
  let config: unknown;
  try {
    config = JSON.parse(decoded.toString('utf8'));
  }
  catch {
    throw new Error('GOOGLE_SERVICES_JSON_BASE64 giải mã được nhưng không chứa JSON hợp lệ.');
  }
  const parsed = androidFirebaseConfig.safeParse(config);
  if (!parsed.success) {
    throw new Error('Cần cấu hình Firebase Android google-services.json, không phải tài khoản dịch vụ Firebase Admin.');
  }
  if (!parsed.data.client.some(client => client.client_info.android_client_info.package_name === androidPackage)) {
    throw new Error(`Cấu hình Firebase không có Android package ${androidPackage}. Hãy dùng file đúng môi trường build.`);
  }

  const directory = path.join(projectRoot, '.firebase');
  mkdirSync(directory, { recursive: true });
  const generated = path.join(directory, `google-services.${androidPackage}.json`);
  writeFileSync(generated, decoded, { mode: 0o600 });
  return generated;
}
