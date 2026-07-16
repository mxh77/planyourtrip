import { column, Schema, Table } from '@powersync/react-native';

const roadtrips = new Table({
  title: column.text,
  startDate: column.text,
  endDate: column.text,
  coverPhotoUrl: column.text,
  status: column.text,
  createdAt: column.text,
  updatedAt: column.text,
  userId: column.text,
});

const steps = new Table({
  name: column.text,
  location: column.text,
  latitude: column.real,
  longitude: column.real,
  startDate: column.text,
  endDate: column.text,
  arrivalTime: column.text,
  departureTime: column.text,
  notes: column.text,
  photoUrl: column.text,
  order: column.integer,
  createdAt: column.text,
  updatedAt: column.text,
  roadtripId: column.text,
  userId: column.text,
});

const accommodations = new Table({
  type: column.text,
  name: column.text,
  address: column.text,
  latitude: column.real,
  longitude: column.real,
  checkIn: column.text,
  checkOut: column.text,
  bookingRef: column.text,
  bookingUrl: column.text,
  pricePerNight: column.real,
  currency: column.text,
  notes: column.text,
  status: column.text,
  createdAt: column.text,
  updatedAt: column.text,
  stepId: column.text,
  roadtripId: column.text,
  userId: column.text,
});

const activities = new Table({
  type: column.text,
  name: column.text,
  location: column.text,
  latitude: column.real,
  longitude: column.real,
  startTime: column.text,
  endTime: column.text,
  bookingRef: column.text,
  bookingUrl: column.text,
  cost: column.real,
  currency: column.text,
  notes: column.text,
  status: column.text,
  order: column.integer,
  createdAt: column.text,
  updatedAt: column.text,
  stepId: column.text,
  roadtripId: column.text,
  userId: column.text,
});

const photos = new Table({
  url: column.text,
  cloudinaryId: column.text,
  caption: column.text,
  isCover: column.integer,
  isPending: column.integer,
  stepId: column.text,
  roadtripId: column.text,
  accommodationId: column.text,
  activityId: column.text,
  userId: column.text,
  createdAt: column.text,
});

const roadtrip_members = new Table({
  role: column.text,
  status: column.text,
  invitedAt: column.text,
  joinedAt: column.text,
  roadtripId: column.text,
  userId: column.text,
  email: column.text,
});

const documents = new Table({
  url: column.text,
  storagePath: column.text,
  originalName: column.text,
  mimeType: column.text,
  fileSize: column.integer,
  name: column.text,
  caption: column.text,
  isPending: column.integer,
  accommodationId: column.text,
  activityId: column.text,
  roadtripId: column.text,
  userId: column.text,
  createdAt: column.text,
});

export const AppSchema = new Schema({
  roadtrips,
  steps,
  accommodations,
  activities,
  photos,
  roadtrip_members,
  documents,
});
