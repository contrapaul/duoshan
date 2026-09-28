/** DOM HUD: score, alive counts, stamina, charge, kill feed, banners, perf stats. */
import { BALLS, HANDLING, PLAYER } from '../sim/tuning';
import type { GameState, SimEvent } from '../sim/types';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const SPECIAL_LABEL: Record<string, string> = {
  slide: 'SLIDE', airborne: 'AIRBORNE', double: 'DOUBLE', bounce_out: 'BOUNCE-OUT', first: 'FIRST BLOOD',
};

export class Hud {
  private feed: { text: string; t: number }[] = [];
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
      if (e.t === 'ko') {
        const how = e.cause === 'line' ? 'crossed the line' : e.cause === 'catch' ? 'got caught out' : e.cause.startsWith('heavy') ? 'tried to stop a heavy ball' : 'is out';
        const by = e.by >= 0 && e.cause !== 'catch' ? `${name(e.by)} ➜ ` : '';
        const tags = e.special.map((s) => `<i>${SPECIAL_LABEL[s] ?? s}</i>`).join(' ');
        const verb = e.player === this.local ? how.replace(/^is /, 'are ') : how;
        this.feed.push({ text: `${by}${name(e.player)} ${verb} ${tags}`, t: 6 });
        if (e.player === this.local) this.showFlash(e.cause === 'line' ? 'CENTERLINE!' : 'OUT!');
      }
      if (e.t === 'catch') {
        this.feed.push({ text: `${name(e.player)} CAUGHT it!`, t: 6 });
        if (e.player === this.local) this.showFlash('CATCH!');
      }
      if (e.t === 'block' && e.player === this.local) this.showFlash(e.broke ? 'HEAVY BALL! Shield knocked away' : 'BLOCK!');
      if (e.t === 'block' && e.broke && e.player !== this.local) this.feed.push({ text: `${name(e.player)} blocked a heavy ball and lost their grip`, t: 4 });
      if (e.t === 'slowmo') this.showBanner(e.cause === 'headshot' ? 'HEADSHOT · SLOW-MO' : 'TARGET HIT · SLOW-MO', 2);
      if (e.t === 'target_spawn') { this.showBanner('TARGET!', 1.5); this.feed.push({ text: 'A target appeared above the centerline: hit it for slow motion', t: 6 }); }
      if (e.t === 'target_hit') {
        this.feed.push({ text: `${name(e.player)} hit the target <i>+${e.coins} DODGECOINS</i>`, t: 6 });
        if (e.player === this.local) this.showFlash(`+${e.coins} Dodgecoins`);
      }
      if (e.t === 'catch_whiff' && e.player === this.local) this.showFlash('whiff');
      if (e.t === 'trip') {
        this.feed.push({ text: `${name(e.player)} tripped${e.cause === 'wall' ? ' into a wall' : e.cause === 'heavy' ? ' over a heavy ball' : ''}`, t: 4 });
      }
      if (e.t === 'revive' && e.player === this.local) this.showFlash('BACK IN!');
      if (e.t === 'possession_drop' && e.player === this.local) this.showFlash('Too slow! Ball dropped');
      if (e.t === 'round_start') this.showBanner('DODGE!', 1.2);
      if (e.t === 'round_end') this.showBanner(`${e.winner === state.players[this.local]!.team ? 'Your team' : 'Other team'} wins the round`, 3);
      if (e.t === 'match_end') this.showBanner(`${e.winner === state.players[this.local]!.team ? 'YOU WIN THE MATCH' : 'Match lost'}`, 3);
    }
    if (this.feed.length > 6) this.feed.splice(0, this.feed.length - 6);
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
      banner = me.reviveT > 0 ? 'Coming back in…' : `You're out · #${pos} to return when a teammate catches`;
    }
    const b = $('banner');
    b.textContent = banner;
    b.classList.toggle('small', me.life === 'out' && state.phase === 'play');

    this.flash.t -= dt;
    const f = $('flash');
    f.textContent = this.flash.t > 0 ? this.flash.text : '';
    f.style.opacity = String(Math.max(0, Math.min(1, this.flash.t * 2)));

    for (const x of this.feed) x.t -= dt;
    this.feed = this.feed.filter((x) => x.t > 0);
    $('feed').innerHTML = this.feed.map((x) => `<div>${x.text}</div>`).join('');

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
}
