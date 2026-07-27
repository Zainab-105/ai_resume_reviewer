/**
 * Applies the stored theme before first paint. Without this the page renders
 * light, then snaps to dark on hydration — a visible flash.
 *
 * Runs before React hydrates, so it must be inline and dependency-free.
 */
export function ThemeScript() {
  const script = `(function(){try{var t=localStorage.getItem('theme')||'system';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d)}catch(e){}})()`;

  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
