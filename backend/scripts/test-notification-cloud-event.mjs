import { randomUUID } from 'node:crypto';
import { connect } from 'amqplib';
import { setTimeout as delay } from 'node:timers/promises';

const target = process.env.NOTIFICATION_TEST_TARGET;
const brokerUrl = process.env.NOTIFICATION_TEST_RABBITMQ_URL;
const apiUrlInput = process.env.NOTIFICATION_TEST_API_URL;
const customerToken = process.env.NOTIFICATION_TEST_CUSTOMER_ACCESS_TOKEN;
const workerToken = process.env.NOTIFICATION_TEST_WORKER_ACCESS_TOKEN;
const exchange = process.env.NOTIFICATION_TEST_EXCHANGE ?? 'handy-go.events';
const customerId = process.env.NOTIFICATION_TEST_CUSTOMER_ID;
const workerId = process.env.NOTIFICATION_TEST_WORKER_ID;
const confirmation = process.env.NOTIFICATION_TEST_SEND_CONFIRM;
const timeoutSeconds = Number(
  process.env.NOTIFICATION_TEST_TIMEOUT_SECONDS ?? 30,
);
const eventId = randomUUID();
const orderId = randomUUID();
const apiPath = '/api/v1/notifications';
let broker;
let publisher;

function fail(message) {
  throw new Error(message);
}

function uuid(value) {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function connectionFailure(error) {
  return String(error?.message ?? 'connection failed')
    .replace(/amqps?:\/\/[^\s@]+@/gi, 'amqps://<credentials>@')
    .replace(/(Bearer\s+)[^\s]+/gi, '$1<redacted>');
}

function requiredSettings() {
  const missing = [
    ['NOTIFICATION_TEST_TARGET', target],
    ['NOTIFICATION_TEST_RABBITMQ_URL', brokerUrl],
    ['NOTIFICATION_TEST_API_URL', apiUrlInput],
    ['NOTIFICATION_TEST_CUSTOMER_ACCESS_TOKEN', customerToken],
    ['NOTIFICATION_TEST_WORKER_ACCESS_TOKEN', workerToken],
    ['NOTIFICATION_TEST_CUSTOMER_ID', customerId],
    ['NOTIFICATION_TEST_WORKER_ID', workerId],
    ['NOTIFICATION_TEST_SEND_CONFIRM', confirmation],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missing.length) {
    fail(
      `Thiếu các biến môi trường bắt buộc: ${missing.join(', ')}. Xem hướng dẫn chạy staging trong apps/notification-service/test/CLOUD-SMOKE.md.`,
    );
  }
  if (!['development', 'staging', 'test'].includes(target))
    fail(
      'NOTIFICATION_TEST_TARGET phải là development, staging hoặc test. Môi trường production bị chặn.',
    );
  if (confirmation !== target)
    fail(
      'Để an toàn, NOTIFICATION_TEST_SEND_CONFIRM phải trùng chính xác với NOTIFICATION_TEST_TARGET.',
    );
  if (!uuid(customerId) || !uuid(workerId) || customerId === workerId)
    fail(
      'Hãy cung cấp hai UUID khác nhau, lần lượt thuộc tài khoản Customer và Worker dùng để kiểm thử.',
    );
  if (
    !Number.isInteger(timeoutSeconds) ||
    timeoutSeconds < 10 ||
    timeoutSeconds > 120
  )
    fail(
      'NOTIFICATION_TEST_TIMEOUT_SECONDS phải là số nguyên từ 10 đến 120.',
    );

  let broker;
  let api;
  try {
    broker = new URL(brokerUrl);
    api = new URL(apiUrlInput);
  } catch {
    fail('URL RabbitMQ hoặc Notification API không hợp lệ.');
  }
  const remoteProductionHost = (hostname) =>
    /(^|[.-])(prod|production|live)([.-]|$)/i.test(hostname);
  if (
    remoteProductionHost(broker.hostname) ||
    remoteProductionHost(api.hostname)
  )
    fail(
      'Hostname broker/API có vẻ thuộc production đã bị chặn. Hãy dùng môi trường development, test hoặc staging riêng.',
    );
  if (
    !['amqp:', 'amqps:'].includes(broker.protocol) ||
    (!['localhost', '127.0.0.1', '[::1]'].includes(broker.hostname) &&
      broker.protocol !== 'amqps:')
  )
    fail('Kết nối RabbitMQ từ xa phải dùng TLS qua amqps://.');
  if (
    !['http:', 'https:'].includes(api.protocol) ||
    (!['localhost', '127.0.0.1', '[::1]'].includes(api.hostname) &&
      api.protocol !== 'https:')
  )
    fail('Kết nối Notification API từ xa phải dùng HTTPS.');
  if (api.pathname.replace(/\/$/, '') !== apiPath || api.search || api.hash)
    fail(
      `NOTIFICATION_TEST_API_URL phải kết thúc bằng ${apiPath}, không có query hoặc fragment.`,
    );
  if (!/^[a-zA-Z0-9._-]{1,180}$/.test(exchange))
    fail('NOTIFICATION_TEST_EXCHANGE chứa ký tự không hợp lệ.');
  return { broker, api };
}

async function publishConfirmed(event) {
  await new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      publisher.removeListener('return', onReturn);
      if (error) reject(error);
      else resolve();
    };
    const onReturn = (message) => {
      if (message.properties.messageId === event.eventId)
        finish(
          new Error(
            `Không có Notification queue nào bind với routing key ${event.eventType} trên exchange đã chọn.`,
          ),
        );
    };
    const timer = setTimeout(
      () => finish(new Error('Hết thời gian chờ RabbitMQ publisher xác nhận.')),
      10000,
    );
    publisher.on('return', onReturn);
    try {
      publisher.publish(
        exchange,
        event.eventType,
        Buffer.from(JSON.stringify(event)),
        {
          contentType: 'application/json',
          persistent: true,
          mandatory: true,
          messageId: event.eventId,
          timestamp: Math.floor(Date.now() / 1000),
        },
        finish,
      );
    } catch (error) {
      finish(error);
    }
  });
}

async function listNotifications(api, userId, accessToken) {
  const response = await fetch(`${api.origin}${apiPath}?limit=20`, {
    headers: { authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(5000),
  });
  if (response.status === 401 || response.status === 403)
    fail(
      `Cloud API từ chối access token kiểm thử (HTTP ${response.status}); hãy dùng token staging còn hạn và có quyền đọc thông báo.`,
    );
  if (!response.ok)
    fail(`Cloud Notification API trả về HTTP ${response.status}.`);
  const body = await response.json();
  return (body?.data?.items ?? []).find(
    (item) =>
      item.payload?.eventType === 'order.created' &&
      item.payload?.entityId === orderId &&
      item.payload?.recipientRole ===
        (userId === customerId ? 'customer' : 'worker'),
  );
}

try {
  const { broker: parsedBroker, api } = requiredSettings();
  console.log(`Môi trường: ${target}`);
  console.log(`RabbitMQ host: ${parsedBroker.hostname}; exchange: ${exchange}`);
  console.log(`Notification API: ${api.origin}${apiPath}`);
  console.log(
    'Đang kết nối đến môi trường cloud non-production đã chọn...',
  );
  broker = await connect(brokerUrl);
  publisher = await broker.createConfirmChannel();

  const event = {
    eventId,
    eventType: 'order.created',
    eventVersion: 1,
    source: 'order-service',
    occurredAt: new Date().toISOString(),
    correlationId: `cloud-smoke-${eventId}`,
    data: { orderId, customerId, workerId },
  };
  console.log(
    `Đang gửi sự kiện mô phỏng ${event.eventType} (eventId ${eventId})...`,
  );
  await publishConfirmed(event);
  console.log(
    'RabbitMQ đã xác nhận và định tuyến sự kiện. Đang chờ Notification Service xử lý và lưu vào PostgreSQL trên cloud...',
  );

  const deadline = Date.now() + timeoutSeconds * 1000;
  let customerNotification;
  let workerNotification;
  while (Date.now() < deadline) {
    [customerNotification, workerNotification] = await Promise.all([
      listNotifications(api, customerId, customerToken),
      listNotifications(api, workerId, workerToken),
    ]);
    if (customerNotification && workerNotification) break;
    await delay(1000);
  }
  if (!customerNotification || !workerNotification)
    fail(
      `Sự kiện đã đến RabbitMQ nhưng không thấy đủ hai thông báo qua cloud API trong ${timeoutSeconds} giây. Hãy kiểm tra consumer, event policy và DLQ.`,
    );

  console.log(
    '\nTHÀNH CÔNG: Notification Service trên cloud đã nhận sự kiện RabbitMQ và cả hai người nhận đều đọc được thông báo trong ứng dụng.',
  );
  console.log(
    JSON.stringify(
      {
        target,
        eventId,
        eventType: event.eventType,
        routingKey: event.eventType,
        recipients: [customerNotification, workerNotification].map(
          (notification) => ({
            notificationId: notification.id,
            title: notification.title,
            body: notification.body,
            unread: notification.readAt === null,
          }),
        ),
        integratedWithActualPublisher: false,
      },
      null,
      2,
    ),
  );
  console.log(
    '\nSự kiện này do script kiểm thử gửi. Kết quả xác minh luồng consumer trên cloud, không xác minh publisher Order Service thực tế.',
  );
} catch (error) {
  process.exitCode = 1;
  console.error(`\nTHẤT BẠI: ${connectionFailure(error)}`);
} finally {
  await publisher?.close().catch(() => undefined);
  await broker?.close().catch(() => undefined);
}
