import { Request, Response } from 'express';
import { z } from 'zod';
import { reconcileIdentity } from '../services/identityService';

const identifySchema = z.object({
    email: z.string().email().nullable().optional(),
    phoneNumber: z.union([z.string(), z.number()]).nullable().optional(), // allow numbers as we treat them as string
}).refine(data => data.email || data.phoneNumber, {
    message: "Either email or phoneNumber must be provided",
});

export const identify = async (req: Request, res: Response) => {
    try {
        const parsedData = identifySchema.safeParse(req.body);

        if (!parsedData.success) {
            return res.status(400).json({ error: parsedData.error.errors[0].message });
        }

        const { email, phoneNumber } = parsedData.data;

        const normalizedEmail = email ? email : null;
        const normalizedPhone = phoneNumber ? String(phoneNumber) : null;

        if (!normalizedEmail && !normalizedPhone) {
            return res.status(400).json({ error: "Either email or phoneNumber must be provided" });
        }

        const result = await reconcileIdentity(normalizedEmail, normalizedPhone);

        return res.status(200).json(result);
    } catch (error) {
        console.error("Error in /identify: ", error);
        return res.status(500).json({ error: "Internal Server Error" });
    }
};
