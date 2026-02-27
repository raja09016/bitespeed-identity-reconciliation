import { PrismaClient, Contact } from '@prisma/client';

const prisma = new PrismaClient();

interface IdentifyResponse {
    contact: {
        primaryContactId: number;
        emails: string[];
        phoneNumbers: string[];
        secondaryContactIds: number[];
    };
}

export const reconcileIdentity = async (
    email: string | null,
    phoneNumber: string | null
): Promise<IdentifyResponse> => {
    return await prisma.$transaction(async (tx) => {
        const queryOr: any[] = [];
        if (email) queryOr.push({ email });
        if (phoneNumber) queryOr.push({ phoneNumber });

        if (queryOr.length === 0) {
            throw new Error("Either email or phoneNumber must be provided");
        }

        // 1. Find directly matching contacts (excluding soft deleted)
        const directMatches = await tx.contact.findMany({
            where: {
                OR: queryOr,
                deletedAt: null
            }
        });

        // 2. If no matches exist, create a new primary contact
        if (directMatches.length === 0) {
            const newContact = await tx.contact.create({
                data: {
                    email,
                    phoneNumber,
                    linkPrecedence: 'primary'
                }
            });
            return formatResponse(newContact, []);
        }

        // 3. We have matches. Find ALL linked contacts in this entire network
        // We collect all primary IDs from the matched contacts
        const primaryIds = new Set<number>();
        for (const match of directMatches) {
            if (match.linkPrecedence === 'primary') {
                primaryIds.add(match.id);
            } else if (match.linkedId) {
                primaryIds.add(match.linkedId);
            }
        }

        // Fetch the entire network spanning these primary IDs
        const allLinkedContacts = await tx.contact.findMany({
            where: {
                OR: [
                    { id: { in: Array.from(primaryIds) } },
                    { linkedId: { in: Array.from(primaryIds) } }
                ],
                deletedAt: null
            },
            orderBy: {
                createdAt: 'asc'
            }
        });

        if (allLinkedContacts.length === 0) {
            throw new Error("Unexpected state: Linked contacts logically cannot be empty.");
        }

        // 4. Identify the oldest primary. That will be the single ultimate primary.
        const oldestPrimary = allLinkedContacts.find(c => c.linkPrecedence === 'primary') || allLinkedContacts[0];

        // Determine current primary ids in the network
        const allRelevantPrimaryIds = Array.from(new Set(
            allLinkedContacts.map(c => c.linkPrecedence === 'primary' ? c.id : c.linkedId).filter(Boolean) as number[]
        ));

        // 5. If there are multiple primary IDs, merge them (make newer primaries secondary)
        const primariesToDemote = allLinkedContacts.filter(
            c => c.linkPrecedence === 'primary' && c.id !== oldestPrimary.id
        );

        if (primariesToDemote.length > 0) {
            const demotedIds = primariesToDemote.map(p => p.id);

            // Demote newer primaries
            await tx.contact.updateMany({
                where: { id: { in: demotedIds } },
                data: {
                    linkPrecedence: 'secondary',
                    linkedId: oldestPrimary.id,
                    updatedAt: new Date()
                }
            });

            // Update any secondary contacts that were pointing to the demoted primaries
            await tx.contact.updateMany({
                where: { linkedId: { in: demotedIds } },
                data: {
                    linkedId: oldestPrimary.id,
                    updatedAt: new Date()
                }
            });

            // Update local array to reflect the changes for formatting the response
            for (const contact of allLinkedContacts) {
                if (demotedIds.includes(contact.id)) {
                    contact.linkPrecedence = 'secondary';
                    contact.linkedId = oldestPrimary.id;
                } else if (contact.linkedId && demotedIds.includes(contact.linkedId)) {
                    contact.linkedId = oldestPrimary.id;
                }
            }
        }

        // 6. Check if we need to create a new secondary contact for new information
        const existingEmails = new Set(allLinkedContacts.map(c => c.email).filter(Boolean));
        const existingPhones = new Set(allLinkedContacts.map(c => c.phoneNumber).filter(Boolean));

        const isNewEmail = email && !existingEmails.has(email);
        const isNewPhone = phoneNumber && !existingPhones.has(phoneNumber);

        if (isNewEmail || isNewPhone) {
            // Also check if an exact duplicate exists to avoid redundant inserts
            const exactDuplicateExists = allLinkedContacts.some(c => c.email === email && c.phoneNumber === phoneNumber);

            if (!exactDuplicateExists) {
                const newSecondary = await tx.contact.create({
                    data: {
                        email,
                        phoneNumber,
                        linkedId: oldestPrimary.id,
                        linkPrecedence: 'secondary'
                    }
                });
                allLinkedContacts.push(newSecondary);
            }
        }

        // 7. Format the response
        return formatResponse(oldestPrimary, allLinkedContacts);
    });
};

const formatResponse = (primaryContact: Contact, allContacts: Contact[]): IdentifyResponse => {
    const emails = new Set<string>();
    const phoneNumbers = new Set<string>();
    const secondaryContactIds = new Set<number>();

    // Add primary info first
    if (primaryContact.email) emails.add(primaryContact.email);
    if (primaryContact.phoneNumber) phoneNumbers.add(primaryContact.phoneNumber);

    // Add info from all other contacts
    for (const contact of allContacts) {
        if (contact.email) emails.add(contact.email);
        if (contact.phoneNumber) phoneNumbers.add(contact.phoneNumber);
        if (contact.id !== primaryContact.id) { // secondary IDs
            secondaryContactIds.add(contact.id);
        }
    }

    return {
        contact: {
            primaryContactId: primaryContact.id,
            emails: Array.from(emails),
            phoneNumbers: Array.from(phoneNumbers),
            secondaryContactIds: Array.from(secondaryContactIds)
        }
    };
};
