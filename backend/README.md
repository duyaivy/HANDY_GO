src code Backend

1. Cài NestJS core
        pnpm add @nestjs/common@12 @nestjs/core@12 @nestjs/platform-express@12 reflect-metadata rxjs
    Add CLI
        pnpm add -D @nestjs/cli@12 
    Check CLI
        pnpm exec nest --version

2. pnpm exec nest new . --package-manager pnpm
    chọn Yes => enter
    chọn ESM => enter

3. 
    pnpm exec nest g app api-gateway
    pnpm exec nest g app auth-service
    pnpm exec nest g app catalog-service
    pnpm exec nest g app order-service
    pnpm exec nest g app user-trust-service
    pnpm exec nest g app bidding-service
    pnpm exec nest g app matching-service
    pnpm exec nest g app payment-service
    pnpm exec nest g app notification-service
    pnpm exec nest g app wallet-service
    pnpm exec nest g app tracking-service

    Tạo health
        pnpm exec nest g controller health --project api-gateway
        pnpm exec nest g module health --project api-gateway

        pnpm exec nest g controller health --project auth-service
        pnpm exec nest g module health --project auth-service

        pnpm exec nest g controller health --project user-trust-service
        pnpm exec nest g module health --project user-trust-service

        pnpm exec nest g controller health --project catalog-service
        pnpm exec nest g module health --project catalog-service

        pnpm exec nest g controller health --project order-service
        pnpm exec nest g module health --project order-service

        pnpm exec nest g controller health --project bidding-service
        pnpm exec nest g module health --project bidding-service

        pnpm exec nest g controller health --project matching-service
        pnpm exec nest g module health --project matching-service

        pnpm exec nest g controller health --project payment-service
        pnpm exec nest g module health --project payment-service

        pnpm exec nest g controller health --project notification-service
        pnpm exec nest g module health --project notification-service

        pnpm exec nest g controller health --project wallet-service
        pnpm exec nest g module health --project wallet-service

        pnpm exec nest g controller health --project tracking-service
        pnpm exec nest g module health --project tracking-service

4. AI-service (py)
    New-Item -ItemType Directory -Force ai-service\app

5. Tạo library
    pnpm exec nest g library common
    pnpm exec nest g library config
    pnpm exec nest g library database
    pnpm exec nest g library auth

    Cần thì cài thêm sau

6. Dependencies:
    pnpm add @nestjs/config
    pnpm add class-validator class-transformer
    pnpm add @nestjs/swagger
    pnpm add @nestjs/jwt
    pnpm add bcrypt
    pnpm add @nestjs/microservices
    pnpm add @nestjs/terminus

    pnpm add -D prisma@latest
    pnpm add @prisma/client@latest

    Cần thì cài thêm sau

7. Chi tiết từng service (THAM KHẢO)
    user-service/
    |---tsconfig.app.json
    |---src/
        |---main.ts
        |---app.module.ts
        |---health/
        |---modules/
        |   |---users/
        |   |   |---controller/
        |   |   |---service/
        |   |   |---dto/
        |   |   |---repository/
        |   |---worker-profiles
        |       |---controller/
        |       |---service/
        |       |---dto/
        |       |---repository/
        |---prisma/ (nếu dùng)

8. API GATEWAY
    NODE_ENV=development
    PORT=3000

    AUTH_SERVICE_URL=http://localhost:3001
    USER_TRUST_SERVICE_URL=http://localhost:3002
    CATALOG_SERVICE_URL=http://localhost:3003
    ORDER_SERVICE_URL=http://localhost:3004
    BIDDING_SERVICE_URL=http://localhost:3005
    MATCHING_SERVICE_URL=http://localhost:3006
    PAYMENT_SERVICE_URL=http://localhost:3007
    NOTIFICATION_SERVICE_URL=http://localhost:3008
    WALLET_SERVICE_URL=http://localhost:3009
    TRACKING_SERVICE_URL=http://localhost:3010

    REDIS_URL=redis://localhost:6379

    KAFKA_BROKERS=localhost:9092
    KAFKA_CLIENT_ID=handy-go-api-gateway
    KAFKA_GROUP_ID=api-gateway-group

    LOG_LEVEL=debug