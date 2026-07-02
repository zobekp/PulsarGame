// PULSAR.io — PROFILE (Phase 6 persistence). Local player profile in localStorage:
// name, meta currency ("cores"), unlocked/equipped cosmetics, lifetime stats. Node-safe (falls back
// to in-memory when there's no localStorage) so the meta logic can be tested headlessly.
window.PULSAR = window.PULSAR || {};
window.PULSAR.Profile = (function () {
  const KEY = 'pulsar_profile';
  const DEFAULT = () => ({ name: '', cores: 0, skin: 'default', unlocked: ['default'], stats: { runs: 0, bestScrap: 0, totalCores: 0 } });

  let mem = null;
  function store() { try { return (typeof localStorage !== 'undefined') ? localStorage : null; } catch (e) { return null; } }
  function load() {
    const s = store();
    if (s) { try { const raw = s.getItem(KEY); if (raw) { const d = Object.assign(DEFAULT(), JSON.parse(raw)); d.stats = Object.assign(DEFAULT().stats, d.stats || {}); if (!Array.isArray(d.unlocked)) d.unlocked = ['default']; return d; } } catch (e) {} }
    return mem || (mem = DEFAULT());
  }
  let data = load();
  function save() { const s = store(); if (s) { try { s.setItem(KEY, JSON.stringify(data)); } catch (e) {} } else mem = data; }

  return {
    get() { return data; },
    setName(n) { data.name = (n || '').slice(0, 16); save(); },
    // Convert a run's EARNED scrap into permanent cores; bump lifetime stats. Returns cores gained.
    bankRun(earnedScrap, bestScrap) {
      const rate = (PULSAR.config && PULSAR.config.meta ? PULSAR.config.meta.coreRate : 0.1);
      const gained = Math.floor(Math.max(0, earnedScrap || 0) * rate);
      data.cores += gained;
      data.stats.runs = (data.stats.runs || 0) + 1;
      data.stats.totalCores = (data.stats.totalCores || 0) + gained;
      if ((bestScrap || 0) > (data.stats.bestScrap || 0)) data.stats.bestScrap = Math.floor(bestScrap);
      save();
      return gained;
    },
    isUnlocked(id) { return data.unlocked.indexOf(id) >= 0; },
    // Spend cores to unlock a cosmetic. Returns true if owned (already or newly), false if too poor.
    unlock(id, cost) {
      if (this.isUnlocked(id)) return true;
      if (data.cores < cost) return false;
      data.cores -= cost; data.unlocked.push(id); save(); return true;
    },
    equip(id) { if (this.isUnlocked(id)) { data.skin = id; save(); return true; } return false; },
  };
})();
