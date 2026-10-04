import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '..');
const keysDir = path.resolve(backendRoot, 'keys');
const envPath = path.resolve(backendRoot, '.env');
const envExamplePath = path.resolve(backendRoot, '.env.example');

if (!fs.existsSync(keysDir)) {
  fs.mkdirSync(keysDir, { recursive: true });
}

const privateKeyPath = path.resolve(keysDir, 'jwt-private.pem');
const publicKeyPath = path.resolve(keysDir, 'jwt-public.pem');

const force = process.argv.includes('--force');

if (fs.existsSync(privateKeyPath) && fs.existsSync(publicKeyPath) && !force) {
  console.log('JWT keys already exist in keys/ directory. Use --force to regenerate.');
} else {
  console.log('Generating new 2048-bit RSA key pair for RS256 JWT...');

  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
    },
  });

  fs.writeFileSync(privateKeyPath, privateKey, { mode: 0o600 });
  fs.writeFileSync(publicKeyPath, publicKey, { mode: 0o644 });

  console.log('Successfully generated key files:');
  console.log(`- Private key file: ${privateKeyPath}`);
  console.log(`- Public key file:  ${publicKeyPath}`);
}

// Sync keys into .env and .env.example
if (fs.existsSync(publicKeyPath) && fs.existsSync(privateKeyPath)) {
  const pubContent = fs.readFileSync(publicKeyPath, 'utf-8').trim();
  const privContent = fs.readFileSync(privateKeyPath, 'utf-8').trim();
  const pubSingleLine = pubContent.replace(/\n/g, '\\n');
  const privSingleLine = privContent.replace(/\n/g, '\\n');

  function syncEnvKeys(targetPath) {
    if (!fs.existsSync(targetPath)) return;
    let content = fs.readFileSync(targetPath, 'utf-8');

    // Replace or add JWT_PUBLIC_KEY
    if (/^JWT_PUBLIC_KEY=/m.test(content)) {
      content = content.replace(/^JWT_PUBLIC_KEY=.*$/m, `JWT_PUBLIC_KEY="${pubSingleLine}"`);
    } else {
      content += `\nJWT_PUBLIC_KEY="${pubSingleLine}"\n`;
    }

    // Replace or add JWT_PRIVATE_KEY
    if (/^JWT_PRIVATE_KEY=/m.test(content)) {
      content = content.replace(/^JWT_PRIVATE_KEY=.*$/m, `JWT_PRIVATE_KEY="${privSingleLine}"`);
    } else {
      content += `JWT_PRIVATE_KEY="${privSingleLine}"\n`;
    }

    fs.writeFileSync(targetPath, content, 'utf-8');
  }

  syncEnvKeys(envPath);
  syncEnvKeys(envExamplePath);
  console.log('Synced JWT_PUBLIC_KEY and JWT_PRIVATE_KEY environment variables into .env and .env.example!');
}
