/** 旅优 2.0 UI（设 NEXT_PUBLIC_V2_UI=false 可回退旧版） */
export function isV2UiEnabled(): boolean {
  if (typeof process !== "undefined" && process.env.NEXT_PUBLIC_V2_UI === "false") {
    return false;
  }
  return true;
}
