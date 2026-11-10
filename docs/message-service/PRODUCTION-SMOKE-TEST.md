# Production Smoke Test Runbook — Message Service
## End-to-End Real-Time & REST Verification

**Project:** HANDY_GO  
**Scope:** Message Service Public & Internal Verification  
**Domain:** `https://handygo.duyaivy.id.vn`  
**Socket.IO Path:** `/api/v1/chat/socket.io/`  

---

## 1. Test Overview

This smoke test verifies the live operational health of Message Service across Nginx (VPS1), WireGuard, Message Service (VPS4), PostgreSQL, RabbitMQ, and interacting services (Auth, Media, Bidding, Order).

---

## 2. Step-by-Step Test Procedure

### 2.1 Health & Connectivity Probes
```bash
# 1. Edge Nginx routing to Message Service health endpoint
curl -s -i "https://handygo.duyaivy.id.vn/api/v1/conversations"
# Expected: 401 Unauthorized (proves Nginx routes /api/v1/conversations to VPS4)

# 2. Direct internal health check over WireGuard from VPS1
ssh deploy@10.77.0.1 "curl -s http://10.77.0.4:3009/health"
# Expected: {"status":"ok","info":{"uptime":...,"database":"healthy"}}
```

---

### 2.2 Security & Authentication Gate Probes
```bash
# 1. Reject unauthenticated request
curl -s -o /dev/null -w "%{http_code}\n" \
  -X GET "https://handygo.duyaivy.id.vn/api/v1/conversations"
# Expected: 401

# 2. Reject forged or malformed JWT token
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer invalid.jwt.token" \
  -X GET "https://handygo.duyaivy.id.vn/api/v1/conversations"
# Expected: 401
```

---

### 2.3 Conversation Creation & Bid Authorization
Use an active customer JWT (`$CUSTOMER_TOKEN`) and an active worker JWT (`$WORKER_TOKEN`).

```bash
# 1. Attempt conversation creation before any bid exists
curl -s -i \
  -H "Authorization: Bearer $CUSTOMER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"bidId":"00000000-0000-0000-0000-000000000001"}' \
  -X POST "https://handygo.duyaivy.id.vn/api/v1/conversations"
# Expected HTTP 403 Forbidden with error code BID_NOT_FOUND or NOT_ELIGIBLE

# 2. Create conversation with a valid committed bid ($VALID_BID_ID)
CONV_RESP=$(curl -s -X POST "https://handygo.duyaivy.id.vn/api/v1/conversations" \
  -H "Authorization: Bearer $CUSTOMER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"bidId\":\"$VALID_BID_ID\"}")

echo $CONV_RESP | jq .
# Expected: HTTP 201 Created
# {
#   "statusCode": 201,
#   "message": "Conversation created",
#   "data": {
#     "id": "<CONVERSATION_UUID>",
#     "serviceRequestId": "<REQUEST_UUID>",
#     "customerId": "<CUSTOMER_UUID>",
#     "workerId": "<WORKER_UUID>"
#   }
# }

CONV_ID=$(echo $CONV_RESP | jq -r '.data.id')

# 3. Test Idempotency: Submit the same bidId again
REPEAT_RESP=$(curl -s -X POST "https://handygo.duyaivy.id.vn/api/v1/conversations" \
  -H "Authorization: Bearer $CUSTOMER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"bidId\":\"$VALID_BID_ID\"}")

# Expected: HTTP 200 OK returning the EXACT SAME conversation ID
```

---

### 2.4 REST History & Cursor Pagination
```bash
# Query conversation messages
curl -s \
  -H "Authorization: Bearer $CUSTOMER_TOKEN" \
  -X GET "https://handygo.duyaivy.id.vn/api/v1/conversations/$CONV_ID/messages?limit=20" | jq .
# Expected:
# {
#   "statusCode": 200,
#   "data": {
#     "messages": [],
#     "hasMore": false,
#     "highWaterSequence": "0"
#   }
# }
```

---

### 2.5 Real-Time WebSocket / Socket.IO Interactive Verification

Execute using a Node.js test script or interactive client (`wscat` / `socket.io-client`):

```javascript
import { io } from 'socket.io-client';

const socketCustomer = io('https://handygo.duyaivy.id.vn', {
  path: '/api/v1/chat/socket.io/',
  auth: { token: CUSTOMER_TOKEN },
  transports: ['websocket']
});

const socketWorker = io('https://handygo.duyaivy.id.vn', {
  path: '/api/v1/chat/socket.io/',
  auth: { token: WORKER_TOKEN },
  transports: ['websocket']
});

// Step 1: Connect and Join Room
socketCustomer.on('connect', () => {
  console.log('Customer connected:', socketCustomer.id);
  socketCustomer.emit('conversation.join', { conversationId: CONV_ID }, (ack) => {
    console.log('Customer joined room:', ack);
  });
});

socketWorker.on('connect', () => {
  console.log('Worker connected:', socketWorker.id);
  socketWorker.emit('conversation.join', { conversationId: CONV_ID });
});

// Step 2: Listen for Message on Customer Side
socketCustomer.on('message.new', (msg) => {
  console.log('Customer received real-time message:', msg);
  // Verify msg.sequence === '1'
  // Verify msg.text === 'Hello Customer!'

  // Step 4: Advance Read Cursor
  socketCustomer.emit('message.read', {
    conversationId: CONV_ID,
    lastReadSequence: msg.sequence
  }, (ack) => {
    console.log('Read cursor ACK:', ack);
  });
});

// Step 3: Worker Sends Message
const idempotencyKey = 'smoke-' + Date.now();
socketWorker.emit('message.send', {
  conversationId: CONV_ID,
  idempotencyKey: idempotencyKey,
  type: 'TEXT',
  text: 'Hello Customer!'
}, (ack) => {
  console.log('Worker send ACK:', ack);
  // Verify ack.sequence === '1'

  // Step 3b: Test Duplicate Idempotent Send
  socketWorker.emit('message.send', {
    conversationId: CONV_ID,
    idempotencyKey: idempotencyKey,
    type: 'TEXT',
    text: 'Hello Customer!'
  }, (dupAck) => {
    console.log('Duplicate send ACK (must match original):', dupAck);
    // Assert dupAck.sequence === ack.sequence
  });
});

// Step 5: Worker Receives Read Receipt
socketWorker.on('message.read.updated', (event) => {
  console.log('Worker observed read receipt:', event);
  // Verify event.lastReadSequence === '1'
});
```

---

### 2.6 Offline Push Notification Verification
1. Disconnect Customer mobile device / close app.
2. Worker sends a message: `"Are you available tomorrow morning?"`.
3. Verify Customer mobile receives Firebase Cloud Messaging (FCM) push notification:
   - **Title**: `HANDY_GO Message`
   - **Body**: `You have a new message regarding your service request.` *(Verify sensitive text is redacted)*
   - **Data Payload**: `{ conversationId: "..." }`
4. Tapping notification opens the chat screen and fetches history via `afterSequence`.

---

### 2.7 Post-Completion Lifecycle Denial
1. Complete or cancel the Service Request in Order Service.
2. Attempt to emit `message.send` from Worker:
   ```json
   {
     "conversationId": "<CONV_ID>",
     "idempotencyKey": "after-completion",
     "type": "TEXT",
     "text": "Are you there?"
   }
   ```
3. Verify Socket ACK error:
   ```json
   {
     "error": {
       "code": "CANNOT_MESSAGE_IN_CURRENT_STATUS",
       "message": "Messaging is closed because service request is completed"
     }
   }
   ```
4. Verify conversation history remains accessible via GET `/messages` (read-only mode).

---

## 3. Smoke Test Sign-Off Checklist

- [ ] HTTP 401 on unauthenticated endpoints.
- [ ] Successful bid-authorized conversation creation.
- [ ] WebSocket upgrade over Nginx TLS connection.
- [ ] Bidirectional real-time delivery within < 200 ms.
- [ ] Monotonic read receipt broadcast.
- [ ] Monotonic contiguous sequence allocation under concurrent sends.
- [ ] Generic push notification delivered to offline participant.
- [ ] Immutability enforced after request completion.
