import { fail } from './errors.js';

/** Helpers to create conventional scanner-friendly text payloads.
 * All output is ordinary text. Encoding templates have no network behavior.
 */
const str = value => value == null ? '' : String(value);
const required = (value, name) => {
  if (!str(value)) fail('INVALID_PAYLOAD', `${name} is required`);
  return str(value);
};

function wifiEscape(input) { return str(input).replace(/[\\;,:"']/g, '\\$&'); }
function cardEscape(input) { return str(input).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/[;,]/g, '\\$&'); }
function foldCRLF(line) {
  // RFC 6350 / RFC 2426: fold vCard content lines at 75 UTF-8 octets, never
  // split a Unicode character, and count the continuation space as an octet.
  const encoder = new TextEncoder();
  let out = '', usedBytes = 0;
  for (const character of line) {
    const bytes = encoder.encode(character).length;
    if (usedBytes + bytes > 75) { out += '\r\n '; usedBytes = 1; }
    out += character;
    usedBytes += bytes;
  }
  return out;
}

export const payloads = Object.freeze({
  text(text) { return str(text); },
  url(url) { return required(url, 'URL'); },
  wifi({ ssid, password = '', security = 'WPA', hidden = false } = {}) {
    required(ssid, 'Wi-Fi SSID');
    if (!['WPA', 'WEP', 'nopass'].includes(security)) fail('INVALID_PAYLOAD', 'Wi-Fi security must be WPA, WEP, or nopass');
    return `WIFI:T:${security};S:${wifiEscape(ssid)};${security === 'nopass' ? '' : `P:${wifiEscape(password)};`}${hidden ? 'H:true;' : ''};`;
  },
  email({ to, subject = '', body = '' } = {}) {
    const receiver = required(to, 'Email recipient');
    const params = new URLSearchParams();
    if (subject) params.set('subject', str(subject));
    if (body) params.set('body', str(body));
    return `mailto:${encodeURIComponent(receiver).replace(/%40/g, '@')}${params.size ? '?' + params.toString().replace(/\+/g, '%20') : ''}`;
  },
  sms({ to, message = '' } = {}) {
    return `sms:${required(to, 'Phone number')}${message ? `?body=${encodeURIComponent(str(message))}` : ''}`;
  },
  telephone(number) { return `tel:${required(number, 'Phone number')}`; },
  geo({ latitude, longitude, altitude } = {}) {
    const lat = Number(latitude), lon = Number(longitude);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) {
      fail('INVALID_PAYLOAD', 'Coordinates must be finite numbers with latitude −90…90 and longitude −180…180');
    }
    if (latitude == null || longitude == null) fail('INVALID_PAYLOAD', 'Latitude and longitude are required');
    const alt = altitude === undefined ? '' : `,${Number(altitude)}`;
    if (altitude !== undefined && !Number.isFinite(Number(altitude))) fail('INVALID_PAYLOAD', 'Altitude must be numeric');
    return `geo:${lat},${lon}${alt}`;
  },
  vcard({ firstName = '', lastName = '', fullName = '', organization = '', title = '', phone = '', email = '', url = '', note = '' } = {}) {
    const displayName = fullName || `${firstName} ${lastName}`.trim();
    required(displayName, 'Contact name');
    const lines = ['BEGIN:VCARD', 'VERSION:3.0', `N:${cardEscape(lastName)};${cardEscape(firstName)};;;`, `FN:${cardEscape(displayName)}`];
    if (organization) lines.push(`ORG:${cardEscape(organization)}`);
    if (title) lines.push(`TITLE:${cardEscape(title)}`);
    if (phone) lines.push(`TEL:${cardEscape(phone)}`);
    if (email) lines.push(`EMAIL:${cardEscape(email)}`);
    if (url) lines.push(`URL:${cardEscape(url)}`);
    if (note) lines.push(`NOTE:${cardEscape(note)}`);
    lines.push('END:VCARD');
    return lines.map(foldCRLF).join('\r\n');
  },
  mecard({ name, phone = '', email = '', url = '' } = {}) {
    const fields = [`N:${wifiEscape(required(name, 'Name'))}`];
    if (phone) fields.push(`TEL:${wifiEscape(phone)}`);
    if (email) fields.push(`EMAIL:${wifiEscape(email)}`);
    if (url) fields.push(`URL:${wifiEscape(url)}`);
    return `MECARD:${fields.join(';')};;`;
  },
});
