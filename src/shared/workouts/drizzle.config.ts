// Where drizzle-kit reads the workouts schema and writes its migrations; `npm run db:generate` runs it for every feature.
export default { dialect: "sqlite", schema: "./src/shared/workouts/schema.ts", out: "./src/shared/workouts/migrations" };
