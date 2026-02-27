import request from 'supertest';
import app from '../src/app';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

beforeEach(async () => {
    await prisma.contact.deleteMany();
});

afterAll(async () => {
    await prisma.$disconnect();
});

describe('POST /identify', () => {
    it('should return 400 if both email and phoneNumber are missing', async () => {
        const res = await request(app).post('/identify').send({});
        expect(res.status).toBe(400);
        expect(res.body.error).toBe("Either email or phoneNumber must be provided");
    });

    it('should create a new primary contact if no match is found', async () => {
        const res = await request(app).post('/identify').send({
            email: 'mcfly@hillvalley.edu',
            phoneNumber: '123456'
        });

        expect(res.status).toBe(200);
        expect(res.body.contact.primaryContactId).toBeDefined();
        expect(res.body.contact.emails).toEqual(['mcfly@hillvalley.edu']);
        expect(res.body.contact.phoneNumbers).toEqual(['123456']);
        expect(res.body.contact.secondaryContactIds).toEqual([]);
    });

    it('should create a secondary contact if email matches but phone is new', async () => {
        const res1 = await request(app).post('/identify').send({
            email: 'lorraine@hillvalley.edu',
            phoneNumber: '123456'
        });
        const primaryId = res1.body.contact.primaryContactId;

        const res2 = await request(app).post('/identify').send({
            email: 'mcfly@hillvalley.edu',
            phoneNumber: '123456'
        });

        expect(res2.status).toBe(200);
        expect(res2.body.contact.primaryContactId).toBe(primaryId);
        expect(res2.body.contact.emails).toEqual(['lorraine@hillvalley.edu', 'mcfly@hillvalley.edu']);
        expect(res2.body.contact.phoneNumbers).toEqual(['123456']);
        expect(res2.body.contact.secondaryContactIds.length).toBe(1);
    });

    it('should create a secondary contact if phone matches but email is new', async () => {
        const res1 = await request(app).post('/identify').send({
            email: 'lorraine@hillvalley.edu',
            phoneNumber: '123456'
        });
        const primaryId = res1.body.contact.primaryContactId;

        const res2 = await request(app).post('/identify').send({
            email: 'lorraine@hillvalley.edu',
            phoneNumber: '987654'
        });

        expect(res2.status).toBe(200);
        expect(res2.body.contact.primaryContactId).toBe(primaryId);
        expect(res2.body.contact.emails).toEqual(['lorraine@hillvalley.edu']);
        expect(res2.body.contact.phoneNumbers).toEqual(['123456', '987654']);
        expect(res2.body.contact.secondaryContactIds.length).toBe(1);
    });

    it('should merge two primary contacts into one primary and one secondary if request links them', async () => {
        const res1 = await request(app).post('/identify').send({
            email: 'doc@hillvalley.edu',
            phoneNumber: '111111'
        });
        const primaryId1 = res1.body.contact.primaryContactId;

        const res2 = await request(app).post('/identify').send({
            email: 'einstein@hillvalley.edu',
            phoneNumber: '222222'
        });
        const primaryId2 = res2.body.contact.primaryContactId;

        const res3 = await request(app).post('/identify').send({
            email: 'doc@hillvalley.edu',
            phoneNumber: '222222'
        });

        expect(res3.status).toBe(200);
        expect(res3.body.contact.primaryContactId).toBe(primaryId1);
        expect(res3.body.contact.emails).toEqual(['doc@hillvalley.edu', 'einstein@hillvalley.edu']);
        expect(res3.body.contact.phoneNumbers).toEqual(['111111', '222222']);
        expect(res3.body.contact.secondaryContactIds).toContain(primaryId2);
    });

    it('should be idempotent and not create duplicate secondary contacts', async () => {
        await request(app).post('/identify').send({
            email: 'biff@hillvalley.edu',
            phoneNumber: '999999'
        });

        const res2 = await request(app).post('/identify').send({
            email: 'biff@hillvalley.edu',
            phoneNumber: '999999'
        });

        expect(res2.body.contact.secondaryContactIds.length).toBe(0); // Exact match, shouldn't create new

        await request(app).post('/identify').send({
            email: 'biff.tannen@hillvalley.edu',
            phoneNumber: '999999'
        });

        // Should create one secondary for the new email
        const res4 = await request(app).post('/identify').send({
            email: 'biff.tannen@hillvalley.edu',
            phoneNumber: '999999'
        });

        // Doing it again shouldn't create another one
        expect(res4.status).toBe(200);
        expect(res4.body.contact.secondaryContactIds.length).toBe(1);
    });

    it('should return combined contacts when queried with a secondary information', async () => {
        await request(app).post('/identify').send({
            email: 'george@hillvalley.edu',
            phoneNumber: '919191'
        });

        await request(app).post('/identify').send({
            email: 'biffsucks@hillvalley.edu',
            phoneNumber: '717171'
        });

        // Merge them
        await request(app).post('/identify').send({
            email: 'george@hillvalley.edu',
            phoneNumber: '717171'
        });

        // Query with secondary email and a new phone
        const res4 = await request(app).post('/identify').send({
            email: 'biffsucks@hillvalley.edu',
            phoneNumber: '818181'
        });

        expect(res4.status).toBe(200);
        expect(res4.body.contact.emails).toEqual(['george@hillvalley.edu', 'biffsucks@hillvalley.edu']);
        expect(res4.body.contact.phoneNumbers).toEqual(['919191', '717171', '818181']);
        expect(res4.body.contact.secondaryContactIds.length).toBe(2);
    });
});
