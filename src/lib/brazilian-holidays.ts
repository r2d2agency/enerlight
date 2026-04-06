// Brazilian national holidays (fixed + movable via Easter)
// Returns all national holidays for a given year

function easterDate(year: number): Date {
  // Meeus/Jones/Butcher algorithm
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1; // 0-indexed
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month, day);
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function getBrazilianHolidays(year: number): Date[] {
  const easter = easterDate(year);

  return [
    // Fixed holidays
    new Date(year, 0, 1),   // Ano Novo
    new Date(year, 3, 21),  // Tiradentes
    new Date(year, 4, 1),   // Dia do Trabalho
    new Date(year, 8, 7),   // Independência
    new Date(year, 9, 12),  // Nossa Senhora Aparecida
    new Date(year, 10, 2),  // Finados
    new Date(year, 10, 15), // Proclamação da República
    new Date(year, 11, 25), // Natal

    // Movable holidays based on Easter
    addDays(easter, -47),   // Carnaval (segunda)
    addDays(easter, -46),   // Carnaval (terça)
    addDays(easter, -2),    // Sexta-feira Santa
    addDays(easter, 60),    // Corpus Christi
  ];
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function getHolidaySet(year: number): Set<string> {
  return new Set(getBrazilianHolidays(year).map(dateKey));
}

export function isHoliday(date: Date): boolean {
  const set = getHolidaySet(date.getFullYear());
  return set.has(dateKey(date));
}

export function isBusinessDay(date: Date): boolean {
  const day = date.getDay();
  if (day === 0 || day === 6) return false;
  return !isHoliday(date);
}
