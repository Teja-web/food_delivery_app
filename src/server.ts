import { app } from "./app";
import { initializeDatabase } from "./db";

const port = Number(process.env.PORT ?? 3000);

await initializeDatabase();

app.listen(port, () => {
  console.log(`Task management API listening on port ${port}`);
});
