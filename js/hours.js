'use strict';

const MARKET_SCHEDULES = {
  brvm:      { name:'BRVM (Abidjan)',               utcOffset:0,    oh:9,  om:0,  ch:15, cm:0,  days:[1,2,3,4,5], note:'09h00–15h00 UTC+0' },
  tsx:       { name:'TSX (Toronto)',                 utcOffset:-4,   oh:9,  om:30, ch:16, cm:0,  days:[1,2,3,4,5], note:'09h30–16h00 EDT (UTC-4)' },
  usa:       { name:'NYSE/NASDAQ (New York)',         utcOffset:-4,   oh:9,  om:30, ch:16, cm:0,  days:[1,2,3,4,5], note:'09h30–16h00 EDT (UTC-4)' },
  europe:    { name:'Euronext/DAX (Paris–Frankfurt)', utcOffset:2,    oh:9,  om:0,  ch:17, cm:30, days:[1,2,3,4,5], note:'09h00–17h30 CEST (UTC+2)' },
  asie:      { name:'Tokyo/Hong Kong',               utcOffset:9,    oh:9,  om:0,  ch:15, cm:30, days:[1,2,3,4,5], note:'09h00–15h30 JST (UTC+9)' },
  emergents: { name:'Mumbai/São Paulo/Joburg',        utcOffset:5.5,  oh:9,  om:15, ch:15, cm:30, days:[1,2,3,4,5], note:'09h15–15h30 IST (UTC+5:30)' }
};

const DAYS_FR = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];

function p2(n) { return n < 10 ? '0' + n : '' + n; }

function getMarketStatus(region) {
  const s = MARKET_SCHEDULES[region];
  if (!s) return null;
  const now    = new Date();
  const utcMs  = now.getTime() + now.getTimezoneOffset() * 60000;
  const locMs  = utcMs + s.utcOffset * 3600000;
  const local  = new Date(locMs);
  const dow    = local.getDay();
  const hm     = local.getHours() * 60 + local.getMinutes();
  const hmOpen = s.oh * 60 + s.om;
  const hmClose= s.ch * 60 + s.cm;
  const isDay  = s.days.includes(dow);
  const isOpen = isDay && hm >= hmOpen && hm < hmClose;

  let nextOpen = '';
  if (!isOpen) {
    if (isDay && hm < hmOpen) {
      nextOpen = `Aujourd'hui à ${p2(s.oh)}h${p2(s.om)}`;
    } else {
      for (let d = 1; d <= 7; d++) {
        const nd = (dow + d) % 7;
        if (s.days.includes(nd)) {
          const label = d === 1 ? 'Demain' : DAYS_FR[nd];
          nextOpen = `${label} à ${p2(s.oh)}h${p2(s.om)}`;
          break;
        }
      }
    }
  }

  return {
    isOpen,
    isDay,
    localTime:   p2(local.getHours()) + 'h' + p2(local.getMinutes()),
    localDayName:DAYS_FR[dow],
    openTime:    p2(s.oh) + 'h' + p2(s.om),
    closeTime:   p2(s.ch) + 'h' + p2(s.cm),
    minUntilClose: isOpen ? hmClose - hm : null,
    nextOpen,
    note: s.note,
    name: s.name
  };
}

// Exportation pour modules ES et script classique
if (typeof module !== 'undefined') {
  module.exports = { getMarketStatus, MARKET_SCHEDULES, DAYS_FR };
} else {
  window.SS_HOURS = { getMarketStatus, MARKET_SCHEDULES, DAYS_FR };
}
