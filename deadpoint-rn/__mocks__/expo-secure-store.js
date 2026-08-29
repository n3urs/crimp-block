/** Jest mock for 'expo-secure-store', mapped in jest.config.js.
    The real module resolves to a compiled native binding
    (build/ExpoSecureStore) that only exists inside an actual iOS/Android
    build via Expo's autolinking — requiring it directly under plain Node
    (this project's jest.config.js runs testEnvironment: 'node', no RN
    preset) throws "Cannot find module .../build/ExpoSecureStore" before a
    single line of test code runs. supabase-timeout.test.ts never invokes
    getItemAsync/setItemAsync/deleteItemAsync — it only needs
    SecureStorageAdapter's three arrow functions to close over real
    functions so `require('../src/data/supabase')` doesn't throw at import
    time — so no-op stubs are sufficient here. */
module.exports = {
  getItemAsync: async () => null,
  setItemAsync: async () => {},
  deleteItemAsync: async () => {},
};
