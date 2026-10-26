/**
 * Trace's chat could not be stopped, and a failed reply only showed a toast.
 * Closing the app and coming back later left a question with no answer and no
 * hint why.
 *
 * Now a Stop button aborts the reply in flight (the open request is cancelled
 * and no further tool runs), and errors and stops are saved in the chat history
 * as notes. A question with no answer and nothing in flight says the request
 * was interrupted.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { callAI, setToolHandler } from '../src/lib/aiChat.js';

const trace = readFileSync(new URL('../src/components/ai/Trace.svelte', import.meta.url), 'utf8');

/** A Claude reply asking for one tool call, then (if asked again) a text reply. */
function fakeClaude() {
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push(opts);
    opts.signal?.throwIfAborted();
    const body = calls.length === 1
      ? { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'get_goals', input: {} }] }
      : { stop_reason: 'end_turn', content: [{ type: 'text', text: 'done' }] };
    return { ok: true, json: async () => body };
  };
  return calls;
}

const ask = (signal) => callAI({
  provider: 'claude', apiKey: 'test', messages: [{ role: 'user', content: 'hi' }],
  systemPrompt: '', tools: [], signal,
});

test('without Stop the tool round runs and the reply comes back', async () => {
  const calls = fakeClaude();
  const ran = [];
  setToolHandler(async (name) => { ran.push(name); return {}; });
  assert.equal(await ask(new AbortController().signal), 'done');
  assert.deepEqual(ran, ['get_goals']);
  assert.equal(calls.length, 2);
  assert.ok(calls.every(c => c.signal), 'every request carries the signal');
});

test('Stop during a tool call ends the turn: no next round', async () => {
  const calls = fakeClaude();
  const ctl = new AbortController();
  setToolHandler(async () => { ctl.abort(); return {}; });
  await assert.rejects(ask(ctl.signal), { name: 'AbortError' });
  assert.equal(calls.length, 1, 'the model is not asked again after Stop');
});

test('Stop before the reply starts sends nothing', async () => {
  const calls = fakeClaude();
  const ctl = new AbortController();
  ctl.abort();
  await assert.rejects(ask(ctl.signal), { name: 'AbortError' });
  assert.equal(calls.length, 0);
});

test('errors and Stop are saved in the chat, not shown as a toast', () => {
  const failure = trace.slice(trace.indexOf('} catch (e) {', trace.indexOf('async function send()')), trace.indexOf('} finally {', trace.indexOf('async function send()')));
  assert.doesNotMatch(failure, /showError/);
  assert.match(failure, /role: 'stopped'/);
  assert.match(failure, /role: 'error'/);
  assert.match(failure, /NtApi\.post\('\/api\/ai\/history', note\)/);
});

test('notes never reach the model', () => {
  assert.match(trace, /\.filter\(m => m\.role === 'user' \|\| m\.role === 'assistant'\)\s*\n\s*\.map\(m => \(\{ role: m\.role, content: m\.content \}\)\)/);
});

test('the send button turns into Stop while a reply is in flight', () => {
  assert.match(trace, /\{#if loading\}\s*<button class="ai-send-btn" on:click=\{stopReply\}/);
});

test('an unanswered last question says the request was interrupted', () => {
  assert.match(trace, /\{#if !loading && messages\.length && messages\[messages\.length - 1\]\.role === 'user'\}/);
});
