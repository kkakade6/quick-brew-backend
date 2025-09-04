import pino from "pino";

const isDev = (process.env.NODE_ENV || "development") !== "production";

export const logger = pino(
  isDev
    ? {
        transport: {
          target: "pino-pretty",
          options: { translateTime: "SYS:standard" },
        },
      }
    : {}
);
