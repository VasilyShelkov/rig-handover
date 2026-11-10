// The night's run log, read into one row per job. The reader lives in `src/digest/read.ts`
// (export `readNight`); routes and views depend only on this file.

export type RunStatus = 'ok' | 'retry' | 'fail';

// "Last" means the latest line in file order (the log is append-only); times are never compared.
export type DigestRow = {
  job: string;
  owner: string | null; // last non-null owner seen; null only if no line names one
  runs: number; // lines for this job, any status
  retries: number; // lines with status 'retry'
  lastStatus: RunStatus;
  lastError: string | null; // most recent `error` seen, even if a later line is ok; null if none
  firstAt: string; // `at` as written in the log, offset kept, never converted to UTC
  lastAt: string;
};

// Valid log lines by status, not jobs: { ok, retry, fail }. Sums to the rows' `runs`.
export type StatusCounts = Record<RunStatus, number>;

export type NightDigest =
  | { found: false } // no file for this night: 404
  | {
      found: true;
      rows: DigestRow[]; // sorted by job (plain string order); routes don't re-sort. [] = "nothing ran"
      counts: StatusCounts;
      // Lines that aren't JSON, or are JSON of the wrong shape (`at`, `job` not strings, `status`
      // not ok | retry | fail, `owner` not string | null, `error` present but not a string).
      // Counted, never thrown; blank lines are skipped, not counted.
      badLines: number;
    };

// A `night` that isn't YYYY-MM-DD never reaches the file system (e.g. `/digest/..%2F..`): it
// returns { found: false }, like a night with no file. An empty file is found, with rows [].
export type ReadNight = (runsDir: string, night: string) => NightDigest;
