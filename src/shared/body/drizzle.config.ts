// Where drizzle-kit reads the body schema and writes its migrations; `npm run db:generate` runs it for every feature.
export default { dialect: "sqlite", schema: "./src/shared/body/schema.ts", out: "./src/shared/body/migrations" };
