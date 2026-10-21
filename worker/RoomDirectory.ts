/**
 * Room directory (PROJECT_PLAN.md §13.6): a single Durable Object that
 * reserves room codes (durable across evictions, in SQLite) and keeps the
 * public-room map that GameRoom heartbeats into. Quick Play matchmaking
 * reuses this map in a later slice.
 */
import { DurableObject } from 'cloudflare:workers';
import { generateRoomCode } from '../src/net/protocol';
import type { Rng } from '../src/sim/rng';

interface DirMsg {
  t: 'create' | 'status' | 'get';
  teamSize?: number;
  code?: string;
  players?: number;
  seats?: number;
  phase?: string;
}

export class RoomDirectory extends DurableObject {
  private db: SqlStorage | undefined;

  private get db0(): SqlStorage {
    if (!this.db) {
      this.db = this.ctx.storage.sql;
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS codes (code TEXT PRIMARY KEY, created_at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS rooms (code TEXT PRIMARY KEY, team_size INTEGER NOT NULL,
          players INTEGER NOT NULL, seats INTEGER NOT NULL, phase TEXT NOT NULL, updated_at INTEGER NOT NULL);
      `);
    }
    return this.db;
  }

  override async fetch(request: Request): Promise<Response> {
    const msg = await request.json().catch(() => undefined) as DirMsg | undefined;
    if (!msg) return Response.json({ error: 'expected JSON' }, { status: 400 });

    if (msg.t === 'create') {
      const teamSize = [3, 5, 8].includes(msg.teamSize ?? 0) ? (msg.teamSize as number) : 3;
      const db = this.db0;
      const rng: Rng = { s: crypto.getRandomValues(new Uint32Array(1))[0]! | 1 };
      // A fresh room almost always gets the first code; retries only on a (rare) collision.
      for (let i = 0; i < 10; i++) {
        const code = generateRoomCode(rng);
        if (!db.exec('SELECT 1 FROM codes WHERE code = ?', code).next().done) continue;
        db.exec('INSERT INTO codes (code, created_at) VALUES (?, ?)', code, Date.now());
        db.exec('INSERT INTO rooms (code, team_size, players, seats, phase, updated_at) VALUES (?, ?, 0, ?, "lobby", ?)',
          code, teamSize, teamSize * 2, Date.now());
        return Response.json({ code, teamSize });
      }
      return Response.json({ error: 'code space exhausted' }, { status: 500 });
    }

    if (msg.t === 'status' && msg.code) {
      this.db0.exec('UPDATE rooms SET players = ?, seats = ?, phase = ?, updated_at = ? WHERE code = ?',
        msg.players ?? 0, msg.seats ?? 0, msg.phase ?? 'lobby', Date.now(), msg.code);
      return Response.json({ ok: true });
    }

    if (msg.t === 'get' && msg.code) {
      const row = this.db0.exec('SELECT code, team_size, players, seats, phase FROM rooms WHERE code = ?', msg.code).next();
      return Response.json(row.done ? null : row.value);
    }

    return Response.json({ error: 'unknown message' }, { status: 400 });
  }
}
