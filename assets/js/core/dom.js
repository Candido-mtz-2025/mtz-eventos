// ========================================
// 🔥 CACHE DE DOM - OTIMIZAÇÃO V11.1
// ========================================
const DOM = {
    _cache: {},
    get(id) {
        if (!this._cache[id]) {
            this._cache[id] = document.getElementById(id);
            if (!this._cache[id]) {
                console.warn(`⚠️ Elemento #${id} não encontrado`);
            }
        }
        return this._cache[id];
    }
};
