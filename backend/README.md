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
    pnpm exec nest g app user-service
    pnpm exec nest g app bidding-service
    pnpm exec nest g app matching-service
    pnpm exec nest g app payment-service
    pnpm exec nest g app notification-service
    pnpm exec nest g app wallet-service
    pnpm exec nest g app tracking-service

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