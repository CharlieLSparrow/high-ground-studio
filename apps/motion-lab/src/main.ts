import { Engine, LandscapeIntroScene } from "@high-ground/motion-engine";

const app = document.getElementById("app")!;
const engine = new Engine(app);

engine.setScene(new LandscapeIntroScene(engine));
engine.start();
