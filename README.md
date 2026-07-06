# CollabSpace

> A unified real-time collaborative workspace — documents, whiteboards, notes, and code pairing — powered by a single sync engine built on **Operational Transform**, **Socket.IO**, and **Redis Pub/Sub**.

[![Phase](https://img.shields.io/badge/Phase-1%20Foundation-6366f1)](/)
[![Stack](https://img.shields.io/badge/Stack-React%20%7C%20Node.js%20%7C%20Socket.IO-6366f1)](/)
[![License](https://img.shields.io/badge/License-MIT-green)](/)

---

## Architecture

```
                    ┌─────────────┐
                    │   Browser   │ (React + Socket.IO client)
                    └──────┬──────┘
                           │ WebSocket
                    ┌──────▼──────┐
                    │  Node.js /  │
                    │  Socket.IO  │  ← Express REST API (auth, rooms, docs)
                    │   Server    │
                    └──┬───────┬──┘
                       │       │
              ┌────────▼┐   ┌─▼─────────┐
              │  Redis   │   │ Postgres  │
              │ Pub/Sub  │   │(documents,│
              │(presence,│   │ users,    │
              │broadcast)│   │ rooms,    │
              └──────────┘   │ op history│
                              └───────────┘
```

### OT Data Flow (Phase 2 — Doc Editor)

1. User types → client generates `Operation` (`insert(pos, chars)` or `delete(pos, count)`)
2. Client sends `{ operation, baseVersion }` to server via Socket.IO
3. Server **transforms** op against all ops applied since `baseVersion` → `transformedOp`
4. Server applies `transformedOp`, bumps `version`, persists to Postgres
5. Server **ACKs** the sender with `{ newVersion, transformedOp }`
6. Server **broadcasts** `transformedOp` to all other clients in the room
7. Other clients apply the operation to their local state

This server-authoritative model matches early Google Docs. The convergence guarantee:
`apply(doc, op2) then apply(op1')` = `apply(doc, op1) then apply(op2')`

---

## Tech Stack

| Layer | Tool | Free Tier |
|---|---|---|
| Frontend | React 18 + Vite | — |
| Frontend Hosting | Vercel / Netlify | ✅ Free |
| Backend | Node.js + Express | — |
| Backend Hosting | Render.com | ✅ Free (cold starts after inactivity) |
| Real-time | Socket.IO | ✅ Open source |
| Pub/Sub | Redis (Upstash) | ✅ 10k cmd/day |
| Database | PostgreSQL (Supabase) | ✅ 500MB |
| Auth | JWT + bcrypt | — |
| ORM | Prisma | — |

> **Note on cold starts:** The Render.com free tier spins down after inactivity. The first request after idle may take 30–60s. This is a known limitation, not a bug.

---

## Project Structure

```
collab-space/
├── client/          # React + Vite frontend
│   └── src/
│       ├── components/
│       │   ├── presence/    # PresenceBar, CursorOverlay
│       │   └── editor/      # DocEditorStub (→ full OT editor in Phase 2)
│       ├── hooks/           # useSocket, usePresence
│       ├── lib/             # socket.ts, api.ts, ot/
│       ├── pages/           # Landing, Auth, Dashboard, Room
│       └── store/           # Zustand stores (auth, room)
│
├── server/          # Node.js + Express + Socket.IO
│   └── src/
│       ├── routes/          # auth, rooms, documents
│       ├── socket/          # presence, ot handlers
│       ├── lib/             # db (Prisma), redis
│       └── middleware/      # auth (JWT)
│
├── shared/          # TypeScript types shared between client & server
│   └── src/
│       ├── types.ts         # User, Room, Operation, SOCKET_EVENTS
│       └── ot/
│           └── transform.ts # OT transform function (insert/delete cases)
│
└── .env.example     # Template — copy to .env and fill in values
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) project (free tier — gives you Postgres + connection string)
- (Optional) An [Upstash](https://upstash.com) Redis database (free tier — for multi-instance pub/sub)

### Setup

```bash
# 1. Clone and install
git clone https://github.com/Bhaskar-Teja-Dev/Collab-Space.git
cd Collab-Space
npm install          # installs all workspaces

# 2. Configure environment
cp .env.example .env
# Edit .env — fill in SUPABASE_URL, DATABASE_URL, JWT_SECRET

# 3. Set up the database
cd server
npm run db:push      # creates tables in Supabase Postgres
npm run db:generate  # generates Prisma client

# 4. Run dev servers (both client + server)
cd ..
npm run dev
```

Open `http://localhost:5173` for the client.
Server runs at `http://localhost:3001`.

---

## Build Phases

| Phase | Feature | Status |
|---|---|---|
| 1 | Foundation: auth, rooms, presence, live cursors | 🏗️ In Progress |
| 2 | Document Editor with OT sync | 🔜 Skeleton ready |
| 3 | Collaborative Whiteboard | ⬜ Planned |
| 4 | Notes (reuses Phase 2 engine) | ⬜ Planned |
| 5 | Code Pair-Programming (Monaco) | ⬜ Planned |
| 6 | Polish, deploy, README + demo GIF | ⬜ Planned |

---

## Resume Line

> Built CollabSpace, a real-time collaborative workspace supporting synchronized document editing, whiteboarding, and code pairing using Operational Transformation, Socket.IO, and Redis Pub/Sub; deployed free with live multi-user demo at [your-url].

---

## License

MIT
