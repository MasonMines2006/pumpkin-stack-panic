import { useEffect, useRef, useState } from "react";
import type { Application, Graphics, Sprite, Texture, Ticker } from "pixi.js";
import type { GameAction } from "@pumpkin/shared";
import { createAttackRoute } from "./host-view.js";

type Point = { x: number; y: number };

function centerInside(element: Element, container: Element): Point {
  const elementRect = element.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  return {
    x: elementRect.left + elementRect.width / 2 - containerRect.left,
    y: elementRect.top + elementRect.height / 2 - containerRect.top
  };
}

function playerElement(playerId: string): HTMLElement | undefined {
  return Array.from(document.querySelectorAll<HTMLElement>("[data-player-id]"))
    .find(element => element.dataset.playerId === playerId);
}

export function BattleEffectsLayer({ action }: { action: GameAction | null }) {
  const layerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const pixiRef = useRef<typeof import("pixi.js") | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    let app: Application | null = null;
    let cancelled = false;
    let initialized = false;

    void import("pixi.js").then(async pixi => {
      if (cancelled) return;
      pixiRef.current = pixi;
      app = new pixi.Application();
      await app.init({
        backgroundAlpha: 0,
        antialias: false,
        autoDensity: true,
        resolution: Math.min(window.devicePixelRatio, 2),
        resizeTo: layer
      });
      initialized = true;
      if (cancelled) {
        app.destroy({ removeView: true }, { children: true });
        return;
      }
      appRef.current = app;
      layer.appendChild(app.canvas);
      setReady(true);
    });

    return () => {
      cancelled = true;
      setReady(false);
      if (appRef.current === app) appRef.current = null;
      pixiRef.current = null;
      if (initialized && app) app.destroy({ removeView: true }, { children: true });
    };
  }, []);

  useEffect(() => {
    const route = createAttackRoute(action);
    const app = appRef.current;
    const pixi = pixiRef.current;
    const layer = layerRef.current;
    if (!ready || !route || !app || !pixi || !layer) return;

    const sourceElement = playerElement(route.sourceId);
    const targetElement = route.targetId === "WITCH"
      ? document.querySelector<HTMLElement>("[data-battle-target='witch']")
      : playerElement(route.targetId);
    if (!sourceElement || !targetElement) return;

    const start = centerInside(sourceElement, layer);
    const end = centerInside(targetElement, layer);
    const control = {
      x: (start.x + end.x) / 2,
      y: Math.min(start.y, end.y) - Math.max(80, Math.abs(end.x - start.x) * .14)
    };
    const hostileColor = route.value < 0 ? 0x54f5ff : 0xff76d8;
    const trail = new pixi.Graphics();
    app.stage.addChild(trail);

    let cancelled = false;
    let projectile: Sprite | null = null;
    let ticker: ((ticker: Ticker) => void) | null = null;
    let impactRing: Graphics | null = null;
    const sparks: Array<{ graphic: Graphics; angle: number; speed: number }> = [];
    let impactStarted = false;

    void pixi.Assets.load<Texture>("/assets/magic-pumpkin.png").then(texture => {
      if (cancelled) return;
      projectile = new pixi.Sprite({ texture, anchor: .5 });
      projectile.width = 72;
      projectile.height = 72;
      projectile.x = start.x;
      projectile.y = start.y;
      projectile.tint = route.value < 0 ? 0xffffff : 0xffa8e7;
      app.stage.addChild(projectile);

      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const duration = reduceMotion ? 100 : 1_100;
      let elapsed = 0;
      ticker = currentTicker => {
        elapsed += currentTicker.deltaMS;
        const progress = Math.min(1, elapsed / duration);
        const flightProgress = Math.min(1, progress / .72);
        const inverse = 1 - flightProgress;
        projectile!.x = inverse * inverse * start.x + 2 * inverse * flightProgress * control.x + flightProgress * flightProgress * end.x;
        projectile!.y = inverse * inverse * start.y + 2 * inverse * flightProgress * control.y + flightProgress * flightProgress * end.y;
        projectile!.rotation += .24 * currentTicker.deltaTime;
        projectile!.scale.set(.72 + Math.sin(flightProgress * Math.PI) * .48);
        projectile!.alpha = flightProgress < 1 ? 1 : Math.max(0, 1 - (progress - .72) / .08);

        trail.clear();
        const points = 18;
        trail.moveTo(start.x, start.y);
        for (let step = 1; step <= Math.ceil(points * flightProgress); step += 1) {
          const time = Math.min(flightProgress, step / points);
          const remaining = 1 - time;
          trail.lineTo(
            remaining * remaining * start.x + 2 * remaining * time * control.x + time * time * end.x,
            remaining * remaining * start.y + 2 * remaining * time * control.y + time * time * end.y
          );
        }
        trail.stroke({ width: 7, color: hostileColor, alpha: .82 });
        trail.alpha = progress < .72 ? 1 : Math.max(0, 1 - (progress - .72) / .28);

        if (!impactStarted && flightProgress === 1) {
          impactStarted = true;
          impactRing = new pixi.Graphics().circle(0, 0, 18).stroke({ width: 8, color: hostileColor, alpha: .9 });
          impactRing.position.set(end.x, end.y);
          app.stage.addChild(impactRing);
          for (let index = 0; index < 14; index += 1) {
            const graphic = new pixi.Graphics().circle(0, 0, 3 + index % 3).fill({ color: index % 2 ? hostileColor : 0xffd66b });
            graphic.position.set(end.x, end.y);
            app.stage.addChild(graphic);
            sparks.push({ graphic, angle: (Math.PI * 2 * index) / 14, speed: 32 + (index % 4) * 11 });
          }
        }

        if (impactStarted) {
          const impactProgress = Math.min(1, (progress - .72) / .28);
          impactRing?.scale.set(1 + impactProgress * 4.5);
          if (impactRing) impactRing.alpha = 1 - impactProgress;
          for (const spark of sparks) {
            spark.graphic.x = end.x + Math.cos(spark.angle) * spark.speed * impactProgress;
            spark.graphic.y = end.y + Math.sin(spark.angle) * spark.speed * impactProgress + 24 * impactProgress * impactProgress;
            spark.graphic.alpha = 1 - impactProgress;
          }
        }

        if (progress === 1 && ticker) {
          app.ticker.remove(ticker);
          ticker = null;
          app.stage.removeChild(projectile!, trail);
          projectile!.destroy();
          trail.destroy();
          projectile = null;
          if (impactRing) {
            app.stage.removeChild(impactRing);
            impactRing.destroy();
            impactRing = null;
          }
          for (const spark of sparks) {
            app.stage.removeChild(spark.graphic);
            spark.graphic.destroy();
          }
          sparks.length = 0;
        }
      };
      app.ticker.add(ticker);
    });

    return () => {
      cancelled = true;
      if (ticker) app.ticker.remove(ticker);
      if (projectile && !projectile.destroyed) {
        app.stage.removeChild(projectile);
        projectile.destroy();
      }
      if (!trail.destroyed) {
        app.stage.removeChild(trail);
        trail.destroy();
      }
      if (impactRing && !impactRing.destroyed) {
        app.stage.removeChild(impactRing);
        impactRing.destroy();
      }
      for (const spark of sparks) {
        if (!spark.graphic.destroyed) {
          app.stage.removeChild(spark.graphic);
          spark.graphic.destroy();
        }
      }
    };
  }, [action, ready]);

  return <div ref={layerRef} className="battle-effects-layer" aria-hidden="true" />;
}
