/* 2FAST4U — DATA LAYER SUPABASE (Fase 2)
   Richiede window.sbClient (creato da auth-guard.js quando Supabase è configurato).
   Espone window.Store con: profilo proprio + operazioni admin sugli altri utenti. */
window.Store = (function () {
  function sb() { return window.sbClient; }
  function ready() { return !!sb(); }

  async function uid() {
    if (!ready()) return null;
    var r = await sb().auth.getUser();
    return (r && r.data && r.data.user) ? r.data.user.id : null;
  }

  return {
    ready: ready,

    // ---- profilo del giocatore corrente ----
    async myProfile() {
      var id = await uid(); if (!id) return null;
      var res = await sb().from('profiles').select('*').eq('id', id).maybeSingle();
      if (res.error) throw res.error;
      return res.data;
    },
    async setMyCoins(coins) {
      var id = await uid(); if (!id) return;
      var res = await sb().from('profiles').update({ coins: coins }).eq('id', id);
      if (res.error) throw res.error;
    },
    async setMyCollection(collection) {
      var id = await uid(); if (!id) return;
      var res = await sb().from('profiles').update({ collection: collection }).eq('id', id);
      if (res.error) throw res.error;
    },

    // ---- operazioni admin (consentite dalle policy solo agli admin) ----
    async listPlayers() {
      var res = await sb().from('profiles')
        .select('id,email,coins,full_unlock,is_admin,updated_at')
        .order('is_admin', { ascending: false })
        .order('email', { ascending: true });
      if (res.error) throw res.error;
      return res.data || [];
    },
    async setPlayerCoins(id, coins) {
      var res = await sb().from('profiles').update({ coins: coins }).eq('id', id);
      if (res.error) throw res.error;
    },
    async setPlayerUnlock(id, on) {
      var res = await sb().from('profiles').update({ full_unlock: !!on }).eq('id', id);
      if (res.error) throw res.error;
    }
  };
})();
