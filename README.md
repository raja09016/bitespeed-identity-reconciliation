# Bitespeed Identity Reconciliation Task

This is a Node.js + TypeScript web service for the Bitespeed Identity Reconciliation task. It implements an `/identify` endpoint that links and consolidates customer identities based on email and phone numbers across multiple purchases.

## Tech Stack
- **Node.js** & **TypeScript**
- **Express** (Web Framework)
- **Prisma** (ORM)
- **SQLite** (Database, easily swappable to PostgreSQL)
- **Zod** (Request Validation)
- **Jest & Supertest** (Testing)

---

## Project Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Variables
Create a `.env` file based on `.env.example`:
```bash
cp .env.example .env
```
Ensure `DATABASE_URL` is set to `file:./dev.db` for SQLite.

### 3. Setup Database (Prisma)
Run the migration command to construct the database schema:
```bash
npm run prisma:migrate
npm run prisma:generate
```

---

## Running the Application

**Development Mode (auto-reload):**
```bash
npm run dev
```

**Production Build:**
```bash
npm run build
npm start
```
The server defaults to port `3000`.

---

## Running Tests
Tests cover all core rules required by the problem: new primary creation, new secondary creation, contact merges and idempotent behavior.

```bash
npm run test
```

---

## Endpoint Details

`POST /identify`

Accepts a JSON payload containing either `email`, `phoneNumber`, or both. 

### Examples

**1. Create a Primary Contact:**
Request:
```bash
curl -X POST http://localhost:3000/identify \
-H "Content-Type: application/json" \
-d '{"email":"mcfly@hillvalley.edu", "phoneNumber":"123456"}'
```
Response:
```json
{
  "contact": {
    "primaryContactId": 1,
    "emails": ["mcfly@hillvalley.edu"],
    "phoneNumbers": ["123456"],
    "secondaryContactIds": []
  }
}
```

**2. Create a Secondary Contact (Matching phone, new email):**
Request:
```bash
curl -X POST http://localhost:3000/identify \
-H "Content-Type: application/json" \
-d '{"email":"lorraine@hillvalley.edu", "phoneNumber":"123456"}'
```
Response:
```json
{
  "contact": {
    "primaryContactId": 1,
    "emails": ["mcfly@hillvalley.edu", "lorraine@hillvalley.edu"],
    "phoneNumbers": ["123456"],
    "secondaryContactIds": [2]
  }
}
```

---

## Deployment (Render.com)

1. Connect your GitHub repository to Render as a **Web Service**.
2. Select `Node` as the environment.
3. **Build Command**: `npm install && npm run prisma:generate && npm run build`
4. **Start Command**: `npm start`
5. Since we strictly use SQLite here, make sure your disk handles local files, or switch the Prisma provider to `"postgresql"` if attaching a render hosted Postgres DB. In that case, use `"postgresql"` in `schema.prisma`.
6. Add `.env` config (e.g., `PORT=10000`).

---

### Folder Structure
- `src/controllers/`: Route handlers handling req/res logic and validation.
- `src/services/`: Core business logic (identity reconciliation logic). 
- `src/routes/`: Express Routes.
- `prisma/`: Prisma schema and database configuration.
- `tests/`: Jest specific test suite files testing service functionality.
