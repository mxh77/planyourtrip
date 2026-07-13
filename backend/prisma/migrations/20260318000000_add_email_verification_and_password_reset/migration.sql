-- AddColumn emailVerifiedAt
ALTER TABLE "users" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);

-- AddColumn emailVerificationToken
ALTER TABLE "users" ADD COLUMN "emailVerificationToken" TEXT;

-- AddColumn emailVerificationExpires
ALTER TABLE "users" ADD COLUMN "emailVerificationExpires" TIMESTAMP(3);

-- CreateIndex unique emailVerificationToken
CREATE UNIQUE INDEX "users_emailVerificationToken_key" ON "users"("emailVerificationToken");

-- CreateTable password_reset_tokens
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex unique token
CREATE UNIQUE INDEX "password_reset_tokens_token_key" ON "password_reset_tokens"("token");

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
