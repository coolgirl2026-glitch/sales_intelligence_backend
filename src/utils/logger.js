export const logger = {
  info: (...args) => console.log(...args),
  warn: (...args) => console.warn(...args),
  error: (...args) => console.error(...args),
  debug: (...args) => {
    if (process.env.NODE_ENV !== "production") {
      console.debug(...args);
    }
  }
};
