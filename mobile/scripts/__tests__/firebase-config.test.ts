import { Buffer } from 'node:buffer';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { resolveGoogleServicesFile } from '../firebase-config';

const androidPackage = 'com.handygo';
const fixture = {
  project_info: { project_id: 'fixture-project', project_number: '12345' },
  client: [{
    client_info: { mobilesdk_app_id: '1:12345:android:fixture', android_client_info: { package_name: androidPackage } },
    api_key: [{ current_key: 'fixture-key' }],
  }],
};
const encode = (data: unknown) => Buffer.from(JSON.stringify(data)).toString('base64');
let projectRoot: string;
beforeEach(() => {
  projectRoot = mkdtempSync(path.join(tmpdir(), 'handygo-firebase-'));
});
afterEach(() => {
  rmSync(projectRoot, { recursive: true, force: true });
});

it('creates the Android client file using Base64 alone, without changing the original file', () => {
  writeFileSync(path.join(projectRoot, 'google-services.json'), 'existing-file');
  const generated = resolveGoogleServicesFile({ projectRoot, androidPackage, base64: encode(fixture) })!;
  expect(JSON.parse(readFileSync(generated, 'utf8'))).toEqual(fixture);
  expect(readFileSync(path.join(projectRoot, 'google-services.json'), 'utf8')).toBe('existing-file');
});
it('regenerates the file when env changes and accepts wrapped Base64', () => {
  const generated = resolveGoogleServicesFile({ projectRoot, androidPackage, base64: encode(fixture) })!;
  const changed = { ...fixture, project_info: { ...fixture.project_info, project_id: 'updated-project' } };
  resolveGoogleServicesFile({ projectRoot, androidPackage, base64: encode(changed).match(/.{1,40}/g)!.join('\n') });
  expect(JSON.parse(readFileSync(generated, 'utf8'))).toEqual(changed);
});
it.each(['not-base64!', '____', Buffer.from('{invalid').toString('base64'), encode({ private_key: 'must-not-appear' })])('rejects invalid configuration without creating a file or exposing input', (base64) => {
  expect(() => resolveGoogleServicesFile({ projectRoot, androidPackage, base64 })).toThrow();
  expect(existsSync(path.join(projectRoot, '.firebase'))).toBe(false);
  try {
    resolveGoogleServicesFile({ projectRoot, androidPackage, base64 });
  }
  catch (error) { expect(String(error)).not.toContain('must-not-appear'); }
});
it('rejects a production-only Firebase file for development', () => {
  expect(() => resolveGoogleServicesFile({ projectRoot, androidPackage: 'com.handygo.preview', base64: encode(fixture) })).toThrow('com.handygo.preview');
  expect(existsSync(path.join(projectRoot, '.firebase'))).toBe(false);
});
it('keeps file-based setup and does not reuse stale generated data when env is absent', () => {
  resolveGoogleServicesFile({ projectRoot, androidPackage, base64: encode(fixture) });
  expect(resolveGoogleServicesFile({ projectRoot, androidPackage })).toBeUndefined();
  expect(resolveGoogleServicesFile({ projectRoot, androidPackage, filePath: '/eas/client.json' })).toBe('/eas/client.json');
  writeFileSync(path.join(projectRoot, 'google-services.json'), JSON.stringify(fixture));
  expect(resolveGoogleServicesFile({ projectRoot, androidPackage })).toBe(path.join(projectRoot, 'google-services.json'));
});
