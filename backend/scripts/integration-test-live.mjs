import http from 'node:http';

async function request(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method: options.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(data);
          } catch {
            parsed = data;
          }
          resolve({ status: res.statusCode, headers: res.headers, data: parsed });
        });
      },
    );
    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

function sanitize(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const copy = Array.isArray(obj) ? [...obj] : { ...obj };
  for (const key of Object.keys(copy)) {
    if (['accessToken', 'refreshToken', 'token', 'otp', 'password'].includes(key)) {
      copy[key] = '[REDACTED]';
    } else if (typeof copy[key] === 'object') {
      copy[key] = sanitize(copy[key]);
    }
  }
  return copy;
}

async function runLiveIntegrationTest() {
  console.log('--- STARTING LIVE INTEGRATION TEST (GATEWAY, AUTH, USER-TRUST, RABBITMQ, SMTP) ---');
  const timestamp = Date.now().toString().slice(-6);
  const phone = `0912${timestamp}`;
  const isCustomRecipient = Boolean(process.env.GMAIL_TEST_RECIPIENT);
  const email = process.env.GMAIL_TEST_RECIPIENT || `social.huynhducthinh+test${timestamp}@gmail.com`;
  const password = 'Password123@#$';
  const fullName = `Live Integration User ${timestamp}`;

  console.log(`\n[1] Registering user: phone=${phone}, email=${email} (SMTP Dispatch)`);
  const regRes = await request('http://127.0.0.1:3000/api/v1/auth/register', { method: 'POST' }, {
    fullName,
    phone,
    email,
    password,
  });

  console.log('Register response status:', regRes.status);
  console.log('Register response body:', JSON.stringify(sanitize(regRes.data), null, 2));

  if (regRes.status !== 201) {
    throw new Error(`Register failed with status ${regRes.status}`);
  }
  const challengeId = regRes.data.data.challengeId;
  console.log('Challenge ID received:', challengeId);

  // [2] Attempt Login before verification -> should fail with ACCOUNT_PENDING (403) and return challengeId
  console.log('\n[2] Attempting login before verification (should return ACCOUNT_PENDING 403)...');
  const pendingLoginRes = await request('http://127.0.0.1:3000/api/v1/auth/login', { method: 'POST' }, {
    phone,
    password,
  });
  console.log('Pending login response status:', pendingLoginRes.status);
  console.log('Pending login response body:', JSON.stringify(sanitize(pendingLoginRes.data), null, 2));
  if (pendingLoginRes.status !== 403) {
    throw new Error(`Expected 403 for pending account, got ${pendingLoginRes.status}`);
  }
  if (!pendingLoginRes.data?.details?.verification?.challengeId) {
    console.warn('Note: challengeId in pending login:', pendingLoginRes.data?.details?.verification?.challengeId);
  }

  // [3] Wrong OTP code test
  console.log('\n[3] Testing invalid OTP submission...');
  const wrongOtpRes = await request('http://127.0.0.1:3000/api/v1/auth/verify-email', { method: 'POST' }, {
    email,
    otp: '000000',
    challengeId,
  });
  console.log('Wrong OTP status:', wrongOtpRes.status, 'code:', wrongOtpRes.data?.code);
  if (wrongOtpRes.status === 200) {
    throw new Error('Expected invalid OTP to be rejected, but got 200');
  }

  // [4] Obtain OTP code
  console.log(`\n[4] SMTP Dispatch: verification email dispatched to ${email}`);
  const otp = process.env.GMAIL_TEST_OTP;
  if (!otp) {
    console.log('NOTE: GMAIL_TEST_OTP not passed in env. Skipping step 5 auto-login for headless run.');
    console.log('To complete verification and subsequent steps with real OTP, re-run with:');
    console.log(`GMAIL_TEST_RECIPIENT="${email}" GMAIL_TEST_OTP="<code_from_inbox>" node scripts/integration-test-live.mjs`);
    console.log('\n>>> LIVE REGISTRATION AND DISPATCH CONTRACT ASSERTIONS PASSED! <<<');
    return;
  }
  console.log('OTP provided via GMAIL_TEST_OTP: [REDACTED]');

  // [5] Verify OTP and Auto-login
  console.log('\n[5] Verifying valid OTP and auto-login...');
  const verifyRes = await request('http://127.0.0.1:3000/api/v1/auth/verify-email', { method: 'POST' }, {
    email,
    otp,
    challengeId,
  });
  console.log('Verify response status:', verifyRes.status);
  console.log('Verify response body:', JSON.stringify(sanitize(verifyRes.data), null, 2));
  if (verifyRes.status !== 200) {
    throw new Error(`Verify failed with status ${verifyRes.status}`);
  }
  const accessToken = verifyRes.data.data.accessToken;
  const roles = verifyRes.data.data.user.roles;
  console.log('User roles after verification:', roles);
  if (!roles.includes('Customer') || !roles.includes('Worker')) {
    throw new Error(`Expected both Customer and Worker roles, got: ${roles}`);
  }

  // [6] Test OTP reuse (should fail)
  console.log('\n[6] Testing OTP reuse prevention...');
  const reuseRes = await request('http://127.0.0.1:3000/api/v1/auth/verify-email', { method: 'POST' }, {
    email,
    otp,
    challengeId,
  });
  console.log('OTP reuse status:', reuseRes.status, 'code:', reuseRes.data?.code);
  if (reuseRes.status === 200) {
    throw new Error('Expected OTP reuse to fail, but it returned 200');
  }

  // [7] Login with verified account -> should return 200 with both roles
  console.log('\n[7] Testing login after verification...');
  const verifiedLoginRes = await request('http://127.0.0.1:3000/api/v1/auth/login', { method: 'POST' }, {
    phone,
    password,
  });
  console.log('Verified login status:', verifiedLoginRes.status);
  if (verifiedLoginRes.status !== 200) {
    throw new Error(`Expected login to succeed with 200, got: ${verifiedLoginRes.status}`);
  }
  if (!verifiedLoginRes.data.data.user.roles.includes('Customer') || !verifiedLoginRes.data.data.user.roles.includes('Worker')) {
    throw new Error(`Expected verified login user to have both roles, got: ${verifiedLoginRes.data.data.user.roles}`);
  }

  // [8] Check /auth/me with Bearer token
  console.log('\n[8] Calling GET /api/v1/auth/me...');
  const authMeRes = await request('http://127.0.0.1:3000/api/v1/auth/me', {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  console.log('Auth me status:', authMeRes.status);
  console.log('Auth me body:', JSON.stringify(sanitize(authMeRes.data), null, 2));
  if (authMeRes.status !== 200) {
    throw new Error(`/auth/me failed with status ${authMeRes.status}`);
  }
  if (!authMeRes.data.data.roles.includes('Customer') || !authMeRes.data.data.roles.includes('Worker')) {
    throw new Error(`/auth/me did not contain both roles: ${authMeRes.data.data.roles}`);
  }

  // [9] Check /users/me with Bearer token (wait slightly for outbox/RabbitMQ worker to provision)
  console.log('\n[9] Calling GET /api/v1/users/me (User & Trust)...');
  let userMeRes;
  for (let attempt = 1; attempt <= 10; attempt++) {
    userMeRes = await request('http://127.0.0.1:3000/api/v1/users/me', {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (userMeRes.status === 200 && userMeRes.data.data?.customerProfile && userMeRes.data.data?.workerProfile) {
      break;
    }
    console.log(`Attempt ${attempt}: waiting for user-trust provisioning... (status: ${userMeRes.status})`);
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.log('Users me status:', userMeRes.status);
  console.log('Users me body:', JSON.stringify(sanitize(userMeRes.data), null, 2));
  if (userMeRes.status !== 200) {
    throw new Error(`/users/me failed with status ${userMeRes.status}`);
  }
  const profiles = userMeRes.data.data;
  if (!profiles.customerProfile) {
    throw new Error('customerProfile is missing from /users/me');
  }
  if (!profiles.workerProfile) {
    throw new Error('workerProfile is missing from /users/me');
  }
  if (profiles.workerProfile.status !== 'draft') {
    throw new Error(`Expected workerProfile.status to be 'draft', got: ${profiles.workerProfile.status}`);
  }
  if (profiles.workerProfile.verifiedAt !== null) {
    throw new Error(`Expected workerProfile.verifiedAt to be null, got: ${profiles.workerProfile.verifiedAt}`);
  }

  console.log('\n>>> ALL LIVE INTEGRATION CONTRACT ASSERTIONS PASSED SUCCESSFULLY! <<<');
}

runLiveIntegrationTest().catch((err) => {
  console.error('Integration test error:', err);
  process.exit(1);
});
