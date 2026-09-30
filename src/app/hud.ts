/** DOM HUD: score, alive counts, stamina, charge, knockout feed, Tab scoreboard, banners, perf. */
import { BALLS, HANDLING, PLAYER } from '../sim/tuning';
import type { BallType } from '../sim/tuning';
import type { GameState, Player, SimEvent } from '../sim/types';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const SPECIAL_LABEL: Record<string, string> = {
  slide: 'SLIDE', airborne: 'AIRBORNE', double: 'DOUBLE', bounce_out: 'BOUNCE-OUT', first: 'FIRST OUT', bank_shot: 'BANK SHOT',
};

// Knockout feed icons (PROJECT_PLAN.md §4.9): small inline SVGs, no downloads.
const BALL_HEX: Record<BallType, string> = { standard: '#e03131', speed: '#ff7b00', heavy: '#3b6fe0', bounce: '#8ee000' };
const ICON = {
  ball: (type: BallType) => `<svg class="ico" viewBox="-10 0 30 20" width="30" height="20"><path d="M-9 7h6M-10 10h7M-9 13h6" stroke="#fff" stroke-width="1.5" opacity=".6"/><circle cx="10" cy="10" r="8" fill="${BALL_HEX[type]}"/><path d="M2.5 8q7.5 3.5 15 0M2.5 12q7.5-3.5 15 0" stroke="#fff" stroke-width="1.2" fill="none" opacity=".7"/></svg>`,
  bigOof: '<svg class="ico" viewBox="0 0 22 20" width="22" height="20"><rect x="3" y="5" width="12" height="13" rx="1" fill="#d9a066"/><rect x="11" y="9" width="2" height="2" fill="#111"/><path d="M15 0l1.6 3.4 3.8.4-2.8 2.5.8 3.7L15 8.1 11.6 10l.8-3.7L9.6 3.8l3.8-.4z" fill="#ffdd33"/></svg>',
  catch: (type: BallType) => `<svg class="ico" viewBox="0 0 30 20" width="30" height="20"><circle cx="15" cy="10" r="6.5" fill="${BALL_HEX[type]}"/><path d="M1 4h5v3h3v9H4q-3 0-3-3z" fill="#e0ac69"/><path d="M29 4h-5v3h-3v9h5q3 0 3-3z" fill="#e0ac69"/></svg>`,
  line: '<svg class="ico" viewBox="0 0 14 20" width="14" height="20"><path d="M7 1v18" stroke="#ffdd33" stroke-width="3" stroke-dasharray="3 2"/></svg>',
  target: '<svg class="ico" viewBox="0 0 20 20" width="20" height="20"><circle cx="10" cy="10" r="9" fill="#ffdd33"/><circle cx="10" cy="10" r="6" fill="#e63946"/><circle cx="10" cy="10" r="3" fill="#fff"/></svg>',
};

/** Feed timing: fade in, hold, fade out (seconds). */
const FEED_IN = 0.2;
const FEED_HOLD = 5;
const FEED_OUT = 0.6;
const FEED_MAX = 5;

export class Hud {
  private feed: { text: string; t: number }[] = [];
  showScoreboard = false;
  private flash = { text: '', t: 0 };
  private banner = { text: '', t: 0 };

  constructor(private local: number) {}

  onEvents(state: GameState, events: SimEvent[]): void {
    const name = (id: number) => {
      const p = state.players[id];
      if (!p) return '?';
      const color = p.team === state.players[this.local]!.team ? 'mate' : 'foe';
      return `<b class="${color}">${p.id === this.local ? 'You' : p.name}</b>`;
    };
    for (const e of events) {
      // The feed is about knockouts: Thrower [icon] Knocked-out player (§4.9).
      if (e.t === 'ko' && e.cause !== 'catch') {
        const type = state.balls[e.ball]?.type ?? 'standard';
        const tags = e.special.filter((x) => SPECIAL_LABEL[x]).map((x) => `<i>${SPECIAL_LABEL[x]}</i>`).join(' ');
        const icon = e.cause === 'line' ? ICON.line : ICON.ball(type) + (e.special.includes('big_oof') ? ICON.bigOof : '');
        const by = e.by >= 0 && e.cause !== 'line' ? `${name(e.by)} ` : '';
        this.feed.push({ text: `${by}${icon} ${name(e.player)} ${tags}`, t: 0 });
        if (e.player === this.local) this.showFlash(e.cause === 'line' ? 'CENTERLINE!' : e.special.includes('big_oof') ? 'BIG OOF!' : 'OUT!');
      }
      if (e.t === 'catch') {
        const type = state.balls[e.ball]?.type ?? 'standard';
        this.feed.push({ text: `${name(e.player)} ${ICON.catch(type)} ${name(e.thrower)}`, t: 0 });
        if (e.player === this.local) this.showFlash('CATCH!');
        if (e.thrower === this.local) this.showFlash('CAUGHT OUT!');
      }
      if (e.t === 'block' && e.player === this.local) this.showFlash(e.broke ? 'HEAVY BALL! Shield knocked away' : 'BLOCK!');
      if (e.t === 'slowmo') this.showBanner(e.cause === 'big_oof' ? 'BIG OOF · SLOW-MO' : 'TARGET HIT · SLOW-MO', 2);
      if (e.t === 'target_spawn') this.showBanner('TARGET! Hit it for slow motion', 2);
      if (e.t === 'target_hit') {
        this.feed.push({ text: `${name(e.player)} ${ICON.target} <i>+${e.coins}</i>`, t: 0 });
        if (e.player === this.local) this.showFlash(`+${e.coins} Dodgecoins`);
      }
      // "Dodge" only when a live ball passes close and misses you (§4.9), never for a missed catch.
      if (e.t === 'dodge' && e.player === this.local) this.showFlash('Dodge');
      if (e.t === 'revive' && e.player === this.local) this.showFlash('BACK IN!');
      if (e.t === 'possession_drop' && e.player === this.local) this.showFlash('Too slow! Ball dropped');
      if (e.t === 'round_start') this.showBanner('DODGE!', 1.2);
      if (e.t === 'round_end') this.showBanner(`${e.winner === state.players[this.local]!.team ? 'Your team' : 'Other team'} wins the round`, 3);
      if (e.t === 'match_end') this.showBanner(`${e.winner === state.players[this.local]!.team ? 'YOU WIN THE MATCH' : 'Match lost'}`, 3);
    }
    if (this.feed.length > FEED_MAX) this.feed.splice(0, this.feed.length - FEED_MAX);
  }

  private showFlash(text: string): void { this.flash = { text, t: 1.0 }; }
  private showBanner(text: string, t: number): void { this.banner = { text, t }; }

  update(state: GameState, dt: number, perf: string, thirdPerson: boolean): void {
    const me = state.players[this.local]!;
    const myTeam = me.team;
    $('score').innerHTML = `<span class="mate">${myTeam === 0 ? 'BLUE' : 'RED'} ${state.score[myTeam]}</span> — <span class="foe">${state.score[1 - myTeam]} ${myTeam === 0 ? 'RED' : 'BLUE'}</span><small>Round ${state.round} · first to 4</small>`;
    const dots = (team: 0 | 1) => state.players.filter((p) => p.team === team)
      .map((p) => `<span class="dot ${p.life === 'out' && p.reviveT <= 0 ? 'out' : ''}"></span>`).join('');
    $('alive').innerHTML = `<div class="mate">${dots(myTeam)}</div><div class="foe">${dots((1 - myTeam) as 0 | 1)}</div>`;

    // Banner: countdown, or "you're out".
    this.banner.t -= dt;
    let banner = this.banner.t > 0 ? this.banner.text : '';
    if (state.phase === 'countdown') banner = `${Math.ceil(state.phaseT)}`;
    else if (me.life === 'out' && state.phase === 'play') {
      const queue = state.players.filter((q) => q.team === myTeam && q.life === 'out' && q.reviveT <= 0).sort((a, b) => a.outOrder - b.outOrder);
      const pos = queue.indexOf(me) + 1;
      banner = me.reviveT > 0 ? 'Coming back in…' : `You're out · #${pos} to return when a teammate catches · watching from the bleachers (V: 1st/3rd person)`;
    }
    const b = $('banner');
    b.textContent = banner;
    b.classList.toggle('small', me.life === 'out' && state.phase === 'play');

    this.flash.t -= dt;
    const f = $('flash');
    f.textContent = this.flash.t > 0 ? this.flash.text : '';
    f.style.opacity = String(Math.max(0, Math.min(1, this.flash.t * 2)));

    // Knockout feed: each entry fades in, holds, then fades out.
    for (const x of this.feed) x.t += dt;
    this.feed = this.feed.filter((x) => x.t < FEED_IN + FEED_HOLD + FEED_OUT);
    $('feed').innerHTML = this.feed.map((x) => {
      const o = x.t < FEED_IN ? x.t / FEED_IN : x.t < FEED_IN + FEED_HOLD ? 1 : 1 - (x.t - FEED_IN - FEED_HOLD) / FEED_OUT;
      return `<div style="opacity:${o.toFixed(2)}">${x.text}</div>`;
    }).join('');
    this.drawScoreboard(state);

    // Stamina + held ball + aim charge.
    $('stamina').style.width = `${(me.stamina / PLAYER.staminaMax) * 100}%`;
    const ball = me.held >= 0 ? state.balls[me.held] : undefined;
    const held = $('held');
    const shield = me.action.kind === 'block' ? ' · SHIELD UP' : '';
    held.textContent = ball ? `${ball.type.toUpperCase()} BALL${shield}${me.heldT > HANDLING.possessionWarn ? ' · THROW IT!' : ''}` : me.life === 'active' ? 'empty hands: click or E to catch' : '';
    held.className = ball ? `ball-${ball.type}${me.heldT > HANDLING.possessionWarn ? ' warn' : ''}` : '';
    const ring = $('charge');
    if (me.action.kind === 'aim' && ball) {
      const def = BALLS[ball.type];
      const windup = Math.min(1, me.action.t / def.windup);
      const charge = Math.max(0, Math.min(1, (me.action.t - def.windup) / (HANDLING.maxCharge - def.windup)));
      ring.style.display = 'block';
      ring.style.setProperty('--p', `${(windup < 1 ? windup * 0.2 : 0.2 + charge * 0.8) * 100}%`);
    } else {
      ring.style.display = 'none';
    }
    $('crosshair').classList.toggle('catching', me.action.kind === 'catch');
    $('crosshair').classList.toggle('blocking', me.action.kind === 'block');
    $('perf').textContent = `${perf} · ${thirdPerson ? '3rd' : '1st'} person (V)`;
    // Slow motion and target status.
    const slow = state.fullSlow ? 'FULL SLOW MOTION' : state.slowT > 0 ? `SLOW-MO ${state.slowT.toFixed(1)}s` : '';
    const target = state.target ? `🎯 TARGET above the centerline · ${Math.ceil(state.target.t)}s · +100 Dodgecoins` : '';
    $('status').textContent = [slow, target].filter(Boolean).join('  ·  ');
    $('coins').textContent = me.coins ? `${me.coins} Dodgecoins` : '';
  }

  /** Hold Tab: every player, their status and scores (§4.9). */
  private drawScoreboard(state: GameState): void {
    const el = $('scoreboard');
    el.classList.toggle('hidden', !this.showScoreboard);
    if (!this.showScoreboard) return;
    const me = state.players[this.local]!;
    const status = (p: Player) => {
      if (p.life === 'tripped') return 'Tripped';
      if (p.life !== 'out') return 'In';
      if (p.reviveT > 0) return 'Returning';
      const queue = state.players.filter((q) => q.team === p.team && q.life === 'out' && q.reviveT <= 0).sort((a, b) => a.outOrder - b.outOrder);
      return `Out · #${queue.indexOf(p) + 1}`;
    };
    const team = (t: 0 | 1) => {
      const rows = state.players.filter((p) => p.team === t).sort((a, b) => b.score - a.score).map((p) => `
        <tr class="${p.life === 'out' ? 'dim' : ''} ${p.id === this.local ? 'me' : ''}">
          <td class="name">${p.id === this.local ? 'You' : p.name}${p.bot ? ' <small>[BOT]</small>' : ''}</td>
          <td>${status(p)}</td><td>${p.kos}</td><td>${p.catches}</td><td>${p.blocks}</td><td><b>${p.score}</b></td><td>${p.coins}</td>
        </tr>`).join('');
      const cls = t === me.team ? 'mate' : 'foe';
      return `<div class="team"><h3 class="${cls}">${t === 0 ? 'BLUE' : 'RED'} · ${state.score[t]}</h3>
        <table><tr><th>Player</th><th>Status</th><th>KOs</th><th>Catches</th><th>Blocks</th><th>Score</th><th>Coins</th></tr>${rows}</table></div>`;
    };
    el.innerHTML = `<div class="sb-head">Round ${state.round} · first to 4</div><div class="sb-teams">${team(me.team)}${team((1 - me.team) as 0 | 1)}</div>`;
  }
}
