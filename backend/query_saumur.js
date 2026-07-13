const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
(async () => {
  const steps = await prisma.step.findMany({ where: { roadtripId: "cmnvx382xp48uyd1h8" }, orderBy: { order: "asc" } });
  console.log("=== STEPS for Au alentours de Saumur ===");
  console.log("Total: " + steps.length);
  for (const s of steps) {
    console.log("[" + s.id + "] order=" + s.order + " | " + s.name + " | type=" + (s.type || "none") + " | lat=" + s.latitude + " lng=" + s.longitude + " | " + (s.location || "") + " | " + (s.startDate?.toISOString()?.split("T")[0] || ""));
  }
  await prisma.$disconnect();
})().catch(e => { console.error(e); process.exit(1); });
