import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';
import type { NightDigest } from '../src/digest/types.js';

function found(d: NightDigest) {
  if (!d.found) throw new Error('expected the night to be found');
  return d;
}

describe('readNight on runs/', () => {
  it('2026-10-28: 5 jobs sorted by job, 1 bad line, counts by line', () => {
    const night = found(readNight('runs', '2026-10-28'));
    expect(night.badLines).toBe(1);
    expect(night.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
    expect(night.rows).toEqual([
      { job: 'digest/render', owner: null, runs: 1, retries: 0, lastStatus: 'ok', lastError: null, firstAt: '2026-10-29T05:41:09+01:00', lastAt: '2026-10-29T05:41:09+01:00' },
      { job: 'fixtures/refresh', owner: 'rook', runs: 4, retries: 3, lastStatus: 'ok', lastError: 'upstream 503', firstAt: '2026-10-29T01:30:00+01:00', lastAt: '2026-10-29T01:37:00+01:00' },
      { job: 'lane/sync', owner: 'rook', runs: 8, retries: 1, lastStatus: 'ok', lastError: 'lock held', firstAt: '2026-10-28T23:00:06+01:00', lastAt: '2026-10-29T05:00:04+01:00' },
      { job: 'notes/backup', owner: 'lane-07', runs: 1, retries: 0, lastStatus: 'fail', lastError: 'quota exceeded', firstAt: '2026-10-29T04:00:01+01:00', lastAt: '2026-10-29T04:00:01+01:00' },
      { job: 'rig/rotate-logs', owner: 'lane-07', runs: 1, retries: 0, lastStatus: 'ok', lastError: null, firstAt: '2026-10-28T23:00:02+01:00', lastAt: '2026-10-28T23:00:02+01:00' },
    ]);
    const runs = night.rows.reduce((n, r) => n + r.runs, 0);
    expect(night.counts.ok + night.counts.retry + night.counts.fail).toBe(runs);
  });

  it('2026-10-27: 4 jobs, no bad lines', () => {
    const night = found(readNight('runs', '2026-10-27'));
    expect(night.rows.map((r) => r.job)).toEqual(['fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs']);
    expect(night.badLines).toBe(0);
  });
});

describe('readNight edge cases', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const write = (night: string, text: string) => writeFileSync(join(dir, `${night}.jsonl`), text);
  const line = (o: object) => JSON.stringify(o);

  it('no file: not found', () => {
    expect(readNight(dir, '2026-01-01')).toEqual({ found: false });
  });

  it('empty file: found, nothing ran', () => {
    write('2026-01-02', '');
    expect(readNight(dir, '2026-01-02')).toEqual({ found: true, rows: [], counts: { ok: 0, retry: 0, fail: 0 }, badLines: 0 });
  });

  it('blank lines are skipped, not counted', () => {
    write('2026-01-03', `\n${line({ at: '2026-01-03T01:00:00+01:00', job: 'a', status: 'ok', owner: 'x' })}\n   \n\n`);
    const night = found(readNight(dir, '2026-01-03'));
    expect(night.badLines).toBe(0);
    expect(night.rows).toHaveLength(1);
  });

  it('JSON of the wrong shape counts as bad', () => {
    const ok = { at: '2026-01-04T01:00:00+01:00', job: 'a', status: 'ok', owner: null };
    write(
      '2026-01-04',
      [
        line(ok),
        line({ ...ok, status: 'done' }),
        line({ ...ok, job: 7 }),
        line({ ...ok, owner: 3 }),
        line({ ...ok, error: { code: 1 } }),
        line({ at: ok.at, job: 'a', status: 'ok' }),
        '[1,2]',
        'null',
        '"text"',
      ].join('\n'),
    );
    const night = found(readNight(dir, '2026-01-04'));
    expect(night.badLines).toBe(8);
    expect(night.counts).toEqual({ ok: 1, retry: 0, fail: 0 });
  });

  it('owner: last non-null wins; lastError: most recent error seen', () => {
    const at = '2026-01-05T01:00:00+01:00';
    write(
      '2026-01-05',
      [
        line({ at, job: 'a', status: 'retry', owner: 'x', error: 'first' }),
        line({ at, job: 'a', status: 'retry', owner: 'y', error: 'second' }),
        line({ at, job: 'a', status: 'ok', owner: null }),
      ].join('\n'),
    );
    const [row] = found(readNight(dir, '2026-01-05')).rows;
    expect(row).toMatchObject({ owner: 'y', lastStatus: 'ok', lastError: 'second', runs: 3, retries: 2 });
  });

  it('a night that is not YYYY-MM-DD never reaches the file system', () => {
    write('2026-1-1', line({ at: '2026-01-01T01:00:00+01:00', job: 'a', status: 'ok', owner: null }));
    expect(readNight(dir, '2026-1-1')).toEqual({ found: false });
    expect(readNight(dir, '../x')).toEqual({ found: false });
    expect(readNight(dir, '../../etc/passwd')).toEqual({ found: false });
  });

  it('other I/O errors throw', () => {
    expect(() => readNight(join(dir, '2026-01-02.jsonl'), '2026-01-02')).toThrow();
  });
});
