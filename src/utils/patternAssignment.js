import { assignPatternToStudent } from './randomizationEngine.js';
import { demoPatternFor } from '../data/demoAccounts.js';

/**
 * Single entry point for "which paper pattern does this candidate get?".
 *
 * Demo accounts have an explicit assignment (CS001 → A … CS005 → E); every
 * other candidate keeps the existing deterministic USN-hash assignment from
 * the randomisation engine. Both are stable across refreshes and sign-ins.
 * (In the Supabase design this corresponds to exam_assignments.pattern_id.)
 */
export function assignPatternForCandidate(identifier) {
  return demoPatternFor(identifier) || assignPatternToStudent(identifier);
}
