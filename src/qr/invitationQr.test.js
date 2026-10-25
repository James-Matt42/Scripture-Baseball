import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { qrcodegen } from '../../tools/qr-studio/vendor/nayuki-qrcodegen.js';
import { getInvitationQrDrawing, INVITATION_QR_PRESETS } from './invitationQr.js';

const URL = 'https://startup.example.org/join-game?code=ABC234';

test('preset generator output stays synchronized with QR Studio design source', () => {
  assert.match(execFileSync(process.execPath, ['tools/compile-qr-presets.mjs', '--check'], {
    cwd: process.cwd(), encoding: 'utf8',
  }), /current/);
});

test('each invitation QR paints the identical valid Standard QR matrix with a quiet zone', () => {
  assert.equal(INVITATION_QR_PRESETS.length, 3);
  const reference = qrcodegen.QrCode.encodeText(URL, qrcodegen.QrCode.Ecc.MEDIUM);
  const expected = new Set();
  for (let y = 0; y < reference.size; y += 1) {
    for (let x = 0; x < reference.size; x += 1) {
      if (reference.getModule(x, y)) expected.add(`${x + 4},${y + 4}`);
    }
  }

  for (const preset of INVITATION_QR_PRESETS) {
    const drawing = getInvitationQrDrawing(URL, preset.id);
    assert.ok(drawing, preset.id);
    assert.equal(drawing.width, reference.size + 8);
    const actual = new Set();
    for (const path of Object.values(drawing.paths)) {
      for (const [, x, y] of path.matchAll(/M(\d+) (\d+)h1v1h-1z/g)) {
        const pos = `${x},${y}`;
        assert.ok(!actual.has(pos), `Unexpected duplicate module at ${pos}`);
        actual.add(pos);
      }
    }
    assert.deepEqual(actual, expected, `${preset.id} must preserve every QR module`);
    assert.ok(drawing.preset.background.startsWith('#'));
    assert.ok(drawing.preset.data.startsWith('#'));
  }
});

test('QR payload is the exact dynamic invitation URL rather than a fixed demo', () => {
  const first = getInvitationQrDrawing(URL);
  const second = getInvitationQrDrawing(URL.replace('ABC234', 'XYZ567'));
  assert.ok(first && second);
  assert.notEqual(first.paths.data, second.paths.data);
});

test('malformed links are not encoded, and missing style IDs use the default', () => {
  for (const invalid of ['', '/join-game?code=ABC234', 'javascript:alert(1)',
    'https://name:secret@example.org/path', 'https://example.org/' + 'a'.repeat(2050)]) {
    assert.equal(getInvitationQrDrawing(invalid), null);
  }
  assert.equal(getInvitationQrDrawing(URL, 'missing')?.preset.id, 'scripture');
  assert.equal(getInvitationQrDrawing('http://localhost:5173/join-game?code=ABC234')?.preset.id, 'scripture');
});
