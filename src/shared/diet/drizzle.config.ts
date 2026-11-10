// Where drizzle-kit reads the diet schema and writes its migrations; `npm run db:generate` runs it for every feature.
export default { dialect: "sqlite", schema: "./src/shared/diet/schema.ts", out: "./src/shared/diet/migrations" };
