// Creates one admin + one driver (Kumar) with a vehicle and verified bank account,
// so you can immediately run the Section 50 "exact test" from the spec.
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const prisma = new PrismaClient();

async function main() {
  await prisma.appSettings.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton", associationName: "Coimbatore Transport Association" },
  });

  const adminUser = await prisma.user.upsert({
    where: { phone: "9999999999" },
    update: {},
    create: { phone: "9999999999", email: "admin@example.com", passwordHash: await bcrypt.hash("Admin@12345", 12), role: "ADMIN" },
  });
  const admin = await prisma.admin.upsert({
    where: { userId: adminUser.id },
    update: {},
    create: { userId: adminUser.id, name: "Association Admin" },
  });

  const driverUser = await prisma.user.upsert({
    where: { phone: "8888888888" },
    update: {},
    create: { phone: "8888888888", email: "kumar@example.com", passwordHash: await bcrypt.hash("Driver@12345", 12), role: "DRIVER" },
  });
  const driver = await prisma.driver.upsert({
    where: { userId: driverUser.id },
    update: {},
    create: {
      userId: driverUser.id,
      employeeId: "DRV-001",
      fullName: "Kumar",
      phone: "8888888888",
      joiningDate: new Date("2024-01-01"),
    },
  });

  await prisma.driverBankAccount.upsert({
    where: { driverId: driver.id },
    update: {},
    create: {
      driverId: driver.id,
      accountHolderName: "Kumar",
      bankName: "Example Bank",
      accountNumber: "1234567890123456",
      ifsc: "EXAMPLE000123",
      verificationStatus: "VERIFIED",
      verifiedAt: new Date(),
      verifiedByAdminId: admin.id,
    },
  });

  const vehicle = await prisma.vehicle.upsert({
    where: { registrationNumber: "TN 38 AB 1234" },
    update: {},
    create: { registrationNumber: "TN 38 AB 1234", vehicleType: "Auto", status: "RUNNING" },
  });
  await prisma.driverVehicleAssignment.create({ data: { driverId: driver.id, vehicleId: vehicle.id } });

  console.log("Seed complete.");
  console.log("Admin login:  9999999999 / Admin@12345");
  console.log("Driver login: 8888888888 / Driver@12345");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
