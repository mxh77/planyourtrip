-- CreateTable
CREATE TABLE "itineraries" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "preferences" TEXT,
    "totalDistance" DOUBLE PRECISION,
    "totalDuration" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "itineraries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "waypoints" (
    "id" TEXT NOT NULL,
    "itineraryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "order" INTEGER NOT NULL,
    "nights" INTEGER NOT NULL DEFAULT 1,
    "checkin" TEXT,
    "checkout" TEXT,
    "departureTime" TEXT,
    "arrivalTime" TEXT,
    "notes" TEXT,
    "selectedCamping" TEXT,
    "campings" TEXT,
    "trails" TEXT,
    "trailResults" TEXT,
    "pois" TEXT,
    "p4n" TEXT,
    "weather" TEXT,
    "distanceFromPrev" DOUBLE PRECISION,
    "durationFromPrev" INTEGER,
    "routePolyline" TEXT,
    "activeOverlays" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "waypoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" TEXT NOT NULL,
    "itineraryId" TEXT,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "toolCalls" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_places" (
    "id" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "type" TEXT NOT NULL,
    "rating" DOUBLE PRECISION,
    "data" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_places_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_preferences" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "groupSize" INTEGER NOT NULL DEFAULT 2,
    "budget" TEXT,
    "vehicleType" TEXT,
    "interests" TEXT,
    "language" TEXT NOT NULL DEFAULT 'fr',
    "mapFilter" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "todo_items" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "category" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "todo_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "saved_places_placeId_key" ON "saved_places"("placeId");

-- AddForeignKey
ALTER TABLE "waypoints" ADD CONSTRAINT "waypoints_itineraryId_fkey" FOREIGN KEY ("itineraryId") REFERENCES "itineraries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_itineraryId_fkey" FOREIGN KEY ("itineraryId") REFERENCES "itineraries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
