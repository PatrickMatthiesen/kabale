const STORAGE_KEY = 'kabale-win-times';
// Keep receipts for the 32 most recent completions per rule set.
const RECEIPT_LIMIT = 32;

function timeKey({ mode, difficulty, emptyColumns }) {
  const variant = `${mode}:${difficulty}`;
  if (mode !== 'klondike') return variant;
  return `${variant}:${emptyColumns === 'any' ? 'any' : 'kings'}`;
}

function isTime(seconds) {
  return Number.isInteger(seconds) && seconds >= 0;
}

function isAttemptId(value) {
  return typeof value === 'string' && value.length > 0;
}

function readReceipt(receipt) {
  if (!isAttemptId(receipt?.attemptId) || !isTime(receipt.completedAt) || !receipt.result) return null;
  const { seconds, previousSeconds, bestSeconds, isNewBest } = receipt.result;
  if (!isTime(seconds) || !isTime(bestSeconds) || bestSeconds > seconds) return null;
  if (previousSeconds !== null && (!isTime(previousSeconds) || bestSeconds > previousSeconds)) return null;
  if (typeof isNewBest !== 'boolean' || (previousSeconds === null && !isNewBest)) return null;
  if (isNewBest && (bestSeconds !== seconds || (previousSeconds !== null && seconds >= previousSeconds))) return null;
  return {
    attemptId: receipt.attemptId,
    completedAt: receipt.completedAt,
    result: { seconds, previousSeconds, bestSeconds, isNewBest },
  };
}

function recentReceipts(receipts) {
  const recent = new Map();
  for (const receipt of receipts.sort((a, b) => b.completedAt - a.completedAt)) {
    if (!recent.has(receipt.attemptId)) recent.set(receipt.attemptId, receipt);
    if (recent.size === RECEIPT_LIMIT) break;
  }
  return [...recent.values()];
}

function findReceipt(record, attemptId) {
  return record?.receipts.find(receipt => receipt.attemptId === attemptId);
}

function mergeTimes(previous, next) {
  if (!previous) return next;
  const last = next.completedAt >= previous.completedAt ? next : previous;
  return {
    lastSeconds: last.lastSeconds,
    lastAttemptId: last.lastAttemptId,
    completedAt: last.completedAt,
    bestSeconds: Math.min(previous.bestSeconds, next.bestSeconds),
  };
}

function mergeRecords(previous, next) {
  if (!previous) return next;
  return {
    ...mergeTimes(previous, next),
    receipts: recentReceipts([...next.receipts, ...previous.receipts]),
  };
}

function sameLastWin(saved, observed) {
  return observed && saved.lastSeconds === observed.lastSeconds && saved.completedAt === observed.completedAt &&
    saved.lastAttemptId === observed.lastAttemptId;
}

function mergePendingReceipts(persisted, wins) {
  const stored = persisted?.receipts ?? [];
  const afterStored = new Map(stored.map(({ attemptId }) => [attemptId, []]));
  const unanchored = [];
  // For equal timestamps, put pending wins ahead of the saved win they followed.
  for (const { record, baseline } of [...wins.values()].reverse()) {
    let group = afterStored.get(baseline?.lastAttemptId);
    if (!group && persisted && sameLastWin(persisted, baseline)) {
      // The latest saved win can have no receipt, for example if it has no attempt ID.
      group = afterStored.get(stored[0]?.attemptId);
    }
    (group ?? unanchored).push(...record.receipts);
  }
  return recentReceipts([
    ...stored.flatMap(receipt => [...afterStored.get(receipt.attemptId), receipt]),
    ...unanchored,
  ]);
}

function readRecords(storage) {
  let raw;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return new Map();
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return new Map();

  const records = new Map();
  for (const [key, record] of Object.entries(data)) {
    if (!isTime(record?.lastSeconds) || !isTime(record.bestSeconds) || record.bestSeconds > record.lastSeconds) continue;
    records.set(key, {
      lastSeconds: record.lastSeconds,
      lastAttemptId: isAttemptId(record.lastAttemptId) ? record.lastAttemptId : undefined,
      bestSeconds: record.bestSeconds,
      // A legacy record has no timestamp and predates any dated completion.
      completedAt: isTime(record.completedAt) ? record.completedAt : -1,
      receipts: Array.isArray(record.receipts) ? recentReceipts(record.receipts.map(readReceipt).filter(Boolean)) : [],
    });
  }
  return records;
}

export function createWinTracker(storage) {
  let records = new Map();
  let persistedRecords = new Map();
  const pending = new Map();

  function recordWin(game, seconds, { attemptId, completedAt = Date.now() } = {}) {
    const key = timeKey(game);
    if (!isAttemptId(attemptId)) attemptId = undefined;
    if (!isTime(completedAt)) completedAt = Date.now();

    const saved = storage ? readRecords(storage) : null;
    const storedReceipt = findReceipt(saved?.get(key), attemptId);
    if (saved) {
      persistedRecords = new Map(saved);
      records = saved;
      for (const [pendingKey, wins] of pending) {
        const persisted = saved.get(pendingKey);
        let unsaved, observed;
        for (const [id, {record, baseline}] of wins) {
          if (findReceipt(persisted, id)) {
            wins.delete(id);
            continue;
          }
          if (!unsaved || record.completedAt >= unsaved.completedAt) observed = baseline;
          unsaved = mergeTimes(unsaved, record);
        }
        if (wins.size === 0) pending.delete(pendingKey);
        if (!unsaved) continue;
        // If timestamps match, prefer the pending win only when storage still has the win it followed.
        const times = !persisted || sameLastWin(persisted, observed)
          ? mergeTimes(persisted, unsaved)
          : mergeTimes(unsaved, persisted);
        records.set(pendingKey, { ...times, receipts: mergePendingReceipts(persisted, wins) });
      }
    }

    const previous = records.get(key);
    const pendingWin = pending.get(key)?.get(attemptId)?.record;
    const receipt = storedReceipt ?? findReceipt(previous, attemptId) ?? findReceipt(pendingWin, attemptId);
    let result = receipt?.result;
    if (!result) {
      const isNewBest = !previous || seconds < previous.bestSeconds;
      const bestSeconds = isNewBest ? seconds : previous.bestSeconds;
      result = { seconds, previousSeconds: previous?.lastSeconds ?? null, bestSeconds, isNewBest };
      if (!isTime(seconds)) return result;

      // A clock adjustment cannot put this win before the one it was compared with.
      completedAt = Math.max(completedAt, previous?.completedAt ?? -1);
      const record = {
        lastSeconds: seconds,
        lastAttemptId: attemptId,
        bestSeconds: seconds,
        completedAt,
        receipts: attemptId === undefined ? [] : [{ attemptId, completedAt, result }],
      };
      records.set(key, mergeRecords(previous, record));
      if (storage) {
        const wins = pending.get(key) ?? new Map();
        // Keep identified wins separate so a receipt from another tab can supersede a failed write.
        // Combine unidentified wins since a retry cannot match them to a saved receipt.
        wins.delete(attemptId);
        wins.set(attemptId, {record: mergeRecords(pendingWin, record), baseline: persistedRecords.get(key)});
        pending.set(key, wins);
      }
    }

    if (saved && pending.size > 0) {
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(records)));
        persistedRecords = new Map(records);
        pending.clear();
      } catch { /* Keep unpersisted wins in this tracker. */ }
    }

    return { ...result };
  }

  return { recordWin };
}
