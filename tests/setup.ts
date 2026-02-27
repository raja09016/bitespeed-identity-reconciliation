import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const clearDatabase = async () => {
    await prisma.contact.deleteMany();
};

afterAll(async () => {
    await prisma.$disconnect();
});
