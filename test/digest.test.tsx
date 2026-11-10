import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

type Line = { at: string; job: string; status: string; owner?: string | null; error?: string };

const line = (l: Line): string => JSON.stringify(l);

let runsDir = '';
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  runsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-runs-'));
  const good = [
    line({ at: '2026-11-01T01:00:00+01:00', job: 'backup', status: 'ok', owner: 'ana' }),
    line({ at: '2026-11-01T02:00:00+01:00', job: 'sync', status: 'retry', owner: 'bo', error: 'timeout' }),
    line({ at: '2026-11-01T02:30:00+01:00', job: 'sync', status: 'ok', owner: 'bo' }),
  ];
  fs.writeFileSync(path.join(runsDir, '2026-11-01.jsonl'), good.join('\n') + '\n');
  fs.writeFileSync(path.join(runsDir, '2026-11-02.jsonl'), '');
  fs.writeFileSync(path.join(runsDir, '2026-11-03.jsonl'), [good[0], 'not json at all', ''].join('\n'));
  process.env.LANE_MARKER = 'TEST-MARKER';
  app = createApp({ ...loadConfig(), runsDir });
});

afterAll(() => {
  fs.rmSync(runsDir, { recursive: true, force: true });
});

describe('GET /digest/:night', () => {
  it('200 HTML with the lane banner and a table for a night with a file', async () => {
    const res = await app.request('/digest/2026-11-01');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(html).toContain('TEST-MARKER');
    expect(html).toContain('<table');
    expect(html).toContain('backup');
    expect(html).toContain('sync');
  });

  it('404 for a night with no file', async () => {
    const res = await app.request('/digest/2026-11-09');
    expect(res.status).toBe(404);
  });

  it('says "nothing ran" for an empty night', async () => {
    const res = await app.request('/digest/2026-11-02');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('200 with the good rows when a line is bad', async () => {
    const res = await app.request('/digest/2026-11-03');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('backup');
  });
});

describe('GET /api/digest/:night', () => {
  it('200 with night, rows, counts and badLines', async () => {
    const res = await app.request('/api/digest/2026-11-01');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      night: string;
      rows: { job: string; runs: number; retries: number; lastStatus: string; lastError: string | null }[];
      counts: Record<string, number>;
      badLines: number;
    };
    expect(body.night).toBe('2026-11-01');
    expect(body.rows.map((r) => r.job)).toEqual(['backup', 'sync']);
    const sync = body.rows[1];
    expect(sync).toMatchObject({ runs: 2, retries: 1, lastStatus: 'ok', lastError: 'timeout' });
    expect(body.rows[0]?.lastError).toBeNull();
    expect(body.counts).toEqual({ ok: 2, retry: 1, fail: 0 });
    expect(body.badLines).toBe(0);
  });

  it('404 with an error string for a night with no file', async () => {
    const res = await app.request('/api/digest/2026-11-09');
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: unknown };
    expect(typeof body.error).toBe('string');
  });

  it('empty night has rows []', async () => {
    const res = await app.request('/api/digest/2026-11-02');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rows: unknown[]; badLines: number };
    expect(body.rows).toEqual([]);
    expect(body.badLines).toBe(0);
  });

  it('a bad line gives 200, badLines 1 and the good rows', async () => {
    const res = await app.request('/api/digest/2026-11-03');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rows: { job: string }[]; badLines: number };
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['backup']);
  });
});
