const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
(async () => {
  const roadtrips = await prisma.roadtrip.findMany({ orderBy: { createdAt: "desc" }, take: 10 });
  console.log("=== ROADTRIPS ===");
  for (const r of roadtrips) {
    console.log("[" + r.id + "] " + r.title + " | " + (r.startDate?.toISOString()?.split("T")[0] || "") + " -> " + (r.endDate?.toISOString()?.split("T")[0] || "") + " | " + r.status);
  }
  const rt = roadtrips[0];
  if (rt) {
    const steps = await prisma.step.findMany({ where: { roadtripId: rt.id }, orderBy: { order: "asc" } });
    console.log("\n=== STEPS for " + rt.title + " ===");
    for (const s of steps) {
      console.log("[" + s.id + "] order=" + s.order + " | " + s.name + " | type=" + s.type + " | lat=" + s.latitude + " lng=" + s.longitude + " | " + (s.location || "") + " | " + (s.startDate?.toISOString()?.split("T")[0] || ""));
    }
    console.log("\nTotal: " + steps.length + " steps");
  }
  await prisma.$disconnect();
})().catch(e => { console.error(e); process.exit(1); });
