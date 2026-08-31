/** Jest mock for AsyncStorage — same class of problem as every other
    __mocks__ file here: the real native module only exists inside an
    actual iOS/Android build. An in-memory Map is a faithful enough
    stand-in for these tests, which only need get/set/persistence-
    within-a-test-run, not cross-process persistence. */
const store = new Map();
module.exports = {
  getItem: async (key) => (store.has(key) ? store.get(key) : null),
  setItem: async (key, value) => { store.set(key, value); },
  removeItem: async (key) => { store.delete(key); },
  clear: async () => { store.clear(); },
};
