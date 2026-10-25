/**
 * MCP tool: list_diary_entries
 *
 * Return the food items logged on a given date. Reads from the same
 * diary row the frontend does (JSON blob per day). Returns items in
 * the order they were added, with resolved nutrition + timestamps.
 *
 * date defaults to today (server-local time). Format: YYYY-MM-DD.
 * Callers whose users are in a different timezone should pass an
 * explicit date rather than rely on the "today" default.
 *
 * Filters out tombstoned diary rows (deleted_at IS NOT NULL) so
 * agents don't see items the user has since deleted.
 */
import { z } from 'zod';
import db from '../../../db.js';
import { DATE_RE, safeJson, todayLocal, toolResult, toolError, isCalendarDate } from '../_util.js';
import { getMealNames, withItemDetails } from '../_diary-items.js';

/**
 * Core lookup, shared by the MCP tool below and the public REST API at
 * GET /api/v1/diary/:date. Throws a plain Error on bad input so callers
 * on either side can decide how to surface it.
 */
export function listDiaryCore(userId, { date } = {}) {
  const day = date || todayLocal();
  if (!isCalendarDate(day)) throw new Error(`Invalid date '${day}'; expected YYYY-MM-DD.`);

  const row = db.prepare(
    `SELECT items FROM diary
      WHERE user_id = ? AND date = ? AND deleted_at IS NULL`
  ).get(userId, day);
  const items = row?.items ? safeJson(row.items, []) : [];
  return { date: day, items: withItemDetails(items, getMealNames(userId)), count: items.length };
}

export function registerListDiary(server, { userId }) {
  server.registerTool(
    'list_diary_entries',
    {
      title: 'List Diary Entries',
      description:
        'Return the food items logged on a given date (YYYY-MM-DD, defaults to today in the SERVER\'s timezone). ' +
        'Each item includes name, meal slot (index and the user\'s meal_name), portion, unit, quantity, ' +
        'nutrition per serving, totals (quantity applied), and the timestamp it was added. ' +
        'Pass an explicit date for agents that need calendar accuracy in a different TZ.',
      inputSchema: {
        date: z.string().regex(DATE_RE, 'YYYY-MM-DD').optional(),
      },
    },
    async ({ date }) => {
      try {
        return toolResult(listDiaryCore(userId, { date }));
      } catch (e) {
        return toolError(e.message);
      }
    }
  );
}
