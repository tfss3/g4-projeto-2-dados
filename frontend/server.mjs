import { createApplication } from "./backend/http.mjs";

const app = createApplication();
const port = Number(process.argv[2] || process.env.PORT || 8090);
app.server.listen(port, app.host, () => {
  console.log("ARGOS disponível em http://" + app.host + ":" + port);
  if (app.initialPassword) {
    console.log("Primeiro acesso administrativo: admin@argos.local");
    console.log(
      "Senha inicial (guarde em local privado): " + app.initialPassword,
    );
  }
  if (app.demoEnabled)
    console.log("Demonstração por perfil habilitada no login local.");
});
function shutdown() {
  app.server.close(() => {
    app.db.close();
    process.exit(0);
  });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
