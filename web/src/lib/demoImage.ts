export async function makeDemoImageFile(title: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 720;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("无法生成演示图片。");
  }

  const bg = context.createLinearGradient(0, 0, 1200, 720);
  bg.addColorStop(0, "#0d1117");
  bg.addColorStop(0.45, "#18212c");
  bg.addColorStop(1, "#263f3a");
  context.fillStyle = bg;
  context.fillRect(0, 0, 1200, 720);

  const glow = context.createRadialGradient(860, 160, 10, 860, 160, 500);
  glow.addColorStop(0, "rgba(183,255,44,0.75)");
  glow.addColorStop(0.35, "rgba(116,212,255,0.24)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, 1200, 720);

  context.fillStyle = "rgba(5,7,9,0.92)";
  context.beginPath();
  context.moveTo(0, 560);
  context.bezierCurveTo(160, 490, 250, 530, 380, 470);
  context.bezierCurveTo(520, 400, 650, 420, 790, 360);
  context.bezierCurveTo(910, 308, 1040, 330, 1200, 260);
  context.lineTo(1200, 720);
  context.lineTo(0, 720);
  context.closePath();
  context.fill();

  context.fillStyle = "#10161c";
  context.beginPath();
  context.moveTo(0, 610);
  context.bezierCurveTo(190, 560, 340, 610, 520, 540);
  context.bezierCurveTo(720, 462, 870, 505, 1200, 410);
  context.lineTo(1200, 720);
  context.lineTo(0, 720);
  context.closePath();
  context.fill();

  context.fillStyle = "#f7f7f4";
  context.font = "700 42px Inter, Arial, sans-serif";
  context.fillText(title.slice(0, 22), 64, 92);
  context.fillStyle = "#a8adb1";
  context.font = "400 24px Inter, Arial, sans-serif";
  context.fillText("光核演示截图 · 可替换为真实游戏图片", 64, 144);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => {
      if (value) {
        resolve(value);
      } else {
        reject(new Error("无法生成演示图片。"));
      }
    }, "image/png");
  });

  return new File([blob], "guanghe-demo-bottle.png", {
    type: "image/png"
  });
}
