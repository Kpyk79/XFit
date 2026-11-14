// Запуск: node --test tests/core.test.mjs
// Перевіряє чисту логіку з браузерних скриптів: штрихкоди карт і дати абонементів.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Мінімальне «вікно», щоб скрипти завантажились без браузера
function load(file) {
  const noop = () => {};
  const win = { addEventListener: noop, matchMedia: () => ({ matches: false }) };
  const ctx = vm.createContext({
    window: win, document: { addEventListener: noop, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
    navigator: {}, crypto: globalThis.crypto, localStorage: { getItem: () => null, setItem: noop },
    location: { search: '', href: 'https://xfit.com.ua/' }, console, URL, btoa, setTimeout, Date,
  });
  win.self = win;
  vm.runInContext(readFileSync(new URL('../js/' + file, import.meta.url), 'utf8'), ctx, { filename: file });
  return win;
}

const card = load('card.js').XFitCard;
const members = load('admin-members.js').XFitMembers;

test('штрихкод: справжній пластиковий номер проходить, зіпсований — ні', () => {
  assert.equal(card.isBarcode('2500000005053'), true); // номер 505 із коментаря в card.js
  assert.equal(card.isBarcode('2500000005054'), false); // змінена контрольна цифра
  assert.equal(card.isBarcode('1500000005053'), false); // не починається з «2»
  assert.equal(card.isBarcode('250000000505'), false); // 12 цифр
});

test('штрихкод: згенерований додатком завжди валідний', () => {
  for (let i = 0; i < 50; i++) assert.equal(card.isBarcode(card.newBarcode()), true);
});

test('номер на пластиковій карті', () => {
  assert.equal(card.plasticNo('2500000005053'), '505');
  assert.equal(card.plasticNo('2512345678901'), ''); // карта з додатку — без номера
});

test('абонемент на місяць: з 1-го по останній день включно', () => {
  assert.equal(members.addMonths('2026-03-10', 1), '2026-04-09');
  assert.equal(members.addMonths('2026-03-10', 3), '2026-06-09');
});

test('абонемент: кінець місяця не «перескакує» на наступний', () => {
  assert.equal(members.addMonths('2026-01-31', 1), '2026-02-27');
  assert.equal(members.addMonths('2028-01-31', 1), '2028-02-28'); // високосний рік
});

test('addDays переходить через межу місяця й року', () => {
  assert.equal(members.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(members.addDays('2026-03-01', -1), '2026-02-28');
});
