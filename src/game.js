import { scenario, errors, distractors } from './scenario.js';

// 게임 상태(발견·오답·시간)와 HUD 갱신을 맡습니다. 3D 코드와 분리해 두었습니다.
export class Game {
  constructor({ onFeedback, onFinish }) {
    this.found = new Set();
    this.wrong = 0;
    this.startedAt = performance.now();
    this.finished = false;
    this.log = []; // 학습 분석용 기록 (중간보고서·평가에 활용)
    this.onFeedback = onFeedback;
    this.onFinish = onFinish;
    document.getElementById('total').textContent = errors.length;
  }

  elapsedSec() { return Math.floor((performance.now() - this.startedAt) / 1000); }

  select(hotspotId) {
    if (this.finished || !hotspotId) return null;
    const t = this.elapsedSec();
    const err = errors.find((e) => e.id === hotspotId);
    if (err) {
      if (this.found.has(err.id)) return null;
      this.found.add(err.id);
      this.log.push({ t, id: err.id, result: 'found' });
      document.getElementById('found').textContent = this.found.size;
      this.onFeedback({ type: 'correct', ...err });
      if (this.found.size === errors.length) this.finish();
      return 'correct';
    }
    const d = distractors.find((x) => x.id === hotspotId);
    this.wrong += 1;
    this.log.push({ t, id: hotspotId, result: 'wrong' });
    document.getElementById('wrong').textContent = this.wrong;
    this.onFeedback({ type: 'wrong', title: '오류가 아닙니다', desc: d ? d.msg : '정상 상태입니다.' });
    return 'wrong';
  }

  tick() {
    if (this.finished) return;
    const s = this.elapsedSec();
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    document.getElementById('timer').textContent = `${mm}:${ss}`;
    if (s >= scenario.timeLimitSec) this.finish();
  }

  finish() {
    if (this.finished) return;
    this.finished = true;
    const score = Math.max(0, this.found.size * 10 - this.wrong * scenario.wrongPenalty * 2);
    const missed = errors.filter((e) => !this.found.has(e.id));
    const summary = { found: this.found.size, total: errors.length, wrong: this.wrong, timeSec: this.elapsedSec(), score, missed, log: this.log };
    console.info('[RoomOfErrors] result', summary);
    this.onFinish(summary);
  }
}
