import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '..');
const keysDir = path.resolve(backendRoot, 'keys');

if (!fs.existsSync(keysDir)) {
  fs.mkdirSync(keysDir, { recursive: true });
}

const privateKeyPath = path.resolve(keysDir, 'jwt-private.pem');
const publicKeyPath = path.resolve(keysDir, 'jwt-public.pem');

const force = process.argv.includes('--force');

if (fs.existsSync(privateKeyPath) && fs.existsSync(publicKeyPath) && !force) {
  console.log('JWT keys already exist in keys/ directory. Use --force to regenerate.');
  process.exit(0);
}

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

console.log('Successfully generated:');
console.log(`- Private key: ${privateKeyPath}`);
console.log(`- Public key:  ${publicKeyPath}`);
