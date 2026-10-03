import { execSync } from "node:child_process";

/** Apply migrations to the test database before integration tests run. */
export default function setup() {
  const args = process.argv.join(" ");
  if (args.includes("tests/unit")) return; // unit tests need no database
  const url =
    process.env.TEST_DATABASE_URL ??
    "postgresql://postgres:postgres@localhost:5432/kumar_ayurveda_test?schema=public";
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url },
  });
}
