-- CreateEnum
CREATE TYPE "RoadtripMemberRole" AS ENUM ('OWNER', 'EDITOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "InviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

-- CreateTable
CREATE TABLE "roadtrip_members" (
    "id" TEXT NOT NULL,
    "role" "RoadtripMemberRole" NOT NULL DEFAULT 'VIEWER',
    "status" "InviteStatus" NOT NULL DEFAULT 'PENDING',
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "joinedAt" TIMESTAMP(3),
    "roadtripId" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT NOT NULL,

    CONSTRAINT "roadtrip_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roadtrip_members_roadtripId_email_key" ON "roadtrip_members"("roadtripId", "email");

-- AddForeignKey
ALTER TABLE "roadtrip_members" ADD CONSTRAINT "roadtrip_members_roadtripId_fkey" FOREIGN KEY ("roadtripId") REFERENCES "roadtrips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roadtrip_members" ADD CONSTRAINT "roadtrip_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
