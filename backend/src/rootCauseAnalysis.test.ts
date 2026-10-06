/**
 * Tests for computeRootCauseAnalysis — specifically the #459 fix:
 * a teacher-supplied errorType (passed via the override endpoint's
 * corrections[].errorType) must win over whatever classifyErrorType()
 * produced for that question.
 *
 * Plain-script convention (node:assert, no runner). Run with:
 *   npm run test:root-cause-analysis --workspace @fln/backend
 */
import assert from 'node:assert';
import { computeRootCauseAnalysis } from './rootCauseAnalysis';
import type { Question } from './db';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (error: any) {
    failed++;
    console.error(`  FAIL  ${name}\n        ${error?.message || error}`);
  }
}

// Minimal Question shape — only the fields computeRootCauseAnalysis reads.
function makeQ(id: string, answer: string, topic = 'Addition', level = 1): Question {
  return {
    question_id: id,
    answer,
    topic,
    source_level: level,
    difficulty: 'medium',
  } as unknown as Question;
}

// ─── Deterministic classifier runs when no teacher label given ────────────────

console.log('\ndeterministic classifier (no teacher errorType)');

test('numeric off-by-one gets off_by_one, not unclassified', () => {
  const qs = [makeQ('q1', '7')];
  const answers = { q1: '8' }; // wrong — off by one
  const result = computeRootCauseAnalysis({}, qs, answers);
  assert.ok(result.rootCauses && result.rootCauses.length === 1, 'should have one rootCause');
  assert.strictEqual(result.rootCauses![0].errorType, 'off_by_one');
});

test('digit reversal gets digit_reversal', () => {
  const qs = [makeQ('q1', '12')];
  const answers = { q1: '21' };
  const result = computeRootCauseAnalysis({}, qs, answers);
  assert.strictEqual(result.rootCauses![0].errorType, 'digit_reversal');
});

test('non-numeric wrong answer stays unclassified without a teacher label', () => {
  const qs = [makeQ('q1', 'सात')];  // word problem answer
  const answers = { q1: 'आठ' };
  const result = computeRootCauseAnalysis({}, qs, answers);
  assert.strictEqual(result.rootCauses![0].errorType, 'unclassified');
});

test('correct answer produces no rootCause entry', () => {
  const qs = [makeQ('q1', '7')];
  const answers = { q1: '7' };
  const result = computeRootCauseAnalysis({}, qs, answers);
  assert.ok(!result.rootCauses || result.rootCauses.length === 0, 'should have no rootCauses for a correct answer');
});

// ─── #459 fix: teacher-supplied errorType wins over classifier ────────────────

console.log('\n#459 — teacher errorType overlay');

test('teacher label replaces classifier result for numeric answer', () => {
  // Classifier would say off_by_one; teacher says it is conceptual
  const qs = [makeQ('q1', '7')];
  const answers = { q1: '8' };
  const result = computeRootCauseAnalysis({}, qs, answers);
  // Simulate the overlay the override endpoint applies after computeRootCauseAnalysis
  const correctionMap = new Map([['q1', { errorType: 'conceptual' }]]);
  const withOverlay = result.rootCauses!.map(rc => {
    const c = correctionMap.get(rc.questionId);
    return c?.errorType ? { ...rc, errorType: c.errorType } : rc;
  });
  assert.strictEqual(withOverlay[0].errorType, 'conceptual');
});

test('teacher label lifts non-numeric answer out of unclassified', () => {
  const qs = [makeQ('q1', 'सात')];
  const answers = { q1: 'आठ' };
  const result = computeRootCauseAnalysis({}, qs, answers);
  assert.strictEqual(result.rootCauses![0].errorType, 'unclassified', 'pre-overlay: should be unclassified');

  // Now apply the overlay
  const correctionMap = new Map([['q1', { errorType: 'prerequisite' }]]);
  const withOverlay = result.rootCauses!.map(rc => {
    const c = correctionMap.get(rc.questionId);
    return c?.errorType ? { ...rc, errorType: c.errorType } : rc;
  });
  assert.strictEqual(withOverlay[0].errorType, 'prerequisite', 'post-overlay: should be teacher label');
});

test('overlay is per-question — unlabelled questions keep classifier result', () => {
  const qs = [makeQ('q1', '7'), makeQ('q2', '12')];
  const answers = { q1: '8', q2: '21' }; // off_by_one, digit_reversal
  const result = computeRootCauseAnalysis({}, qs, answers);

  // Teacher only labels q1
  const correctionMap = new Map([['q1', { errorType: 'careless' }]]);
  const withOverlay = result.rootCauses!.map(rc => {
    const c = correctionMap.get(rc.questionId);
    return c?.errorType ? { ...rc, errorType: c.errorType } : rc;
  });

  const q1Entry = withOverlay.find(r => r.questionId === 'q1');
  const q2Entry = withOverlay.find(r => r.questionId === 'q2');
  assert.strictEqual(q1Entry?.errorType, 'careless', 'q1 should carry teacher label');
  assert.strictEqual(q2Entry?.errorType, 'digit_reversal', 'q2 should keep classifier result');
});

test('empty errorType string from teacher does not override (falsy guard)', () => {
  const qs = [makeQ('q1', '7')];
  const answers = { q1: '8' };
  const result = computeRootCauseAnalysis({}, qs, answers);

  // Empty string is falsy — should not override
  const correctionMap = new Map([['q1', { errorType: '' }]]);
  const withOverlay = result.rootCauses!.map(rc => {
    const c = correctionMap.get(rc.questionId);
    return c?.errorType ? { ...rc, errorType: c.errorType } : rc;
  });
  assert.strictEqual(withOverlay[0].errorType, 'off_by_one', 'empty string should not override classifier');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
