/** YT 全域（iframe_api 載入後才有）。型別只寫用得到的，不裝 @types/youtube。 */
export type YTNamespace = any;

let loading: Promise<YTNamespace> | null = null;

/** 載入 YouTube iframe API，只插一次 script；主播放器（YoutubePlayer）與唱唱看原唱共用。 */
export function loadYouTubeApi(): Promise<YTNamespace> {
  const w = window as unknown as { YT?: YTNamespace; onYouTubeIframeAPIReady?: () => void };
  if (w.YT?.Player) return Promise.resolve(w.YT);
  return (loading ??= new Promise((resolve) => {
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(w.YT);
    };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    document.head.append(s);
  }));
}
