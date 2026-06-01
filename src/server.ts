import { app } from "./app.js";
import { initializeDatabase } from "./db/index.js";

const port = Number(process.env.PORT ?? 3000);

await initializeDatabase();

app.listen(port, () => {
  console.log(`Task management API listening on port ${port}`);
});
