/**
 * Simple Persistence Layer to simulate a database in the browser
 */
export const storage = {
  get: (key, defaultValue) => {
    const data = localStorage.getItem(`axim_${key}`);
    return data ? JSON.parse(data) : defaultValue;
  },
  set: (key, value) => {
    localStorage.setItem(`axim_${key}`, JSON.stringify(value));
  },
  // Simulate an async DB call
  getAsync: async (key, defaultValue) => {
    return new Promise((resolve) => {
      setTimeout(() => resolve(storage.get(key, defaultValue)), 300);
    });
  }
};