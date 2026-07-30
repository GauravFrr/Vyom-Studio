import { useEffect } from 'react'
import useSettingsStore from '../store/settingsStore'

/**
 * Apply the user's display preferences (ui density, font scale, reduce-motion,
 * color-blind-safe palette) to the <html> element so they take effect
 * globally — not just on the Settings page.
 *
 * Implementation: a single useEffect that reads the store on mount AND
 * subscribes to changes, so a tweak in Settings reflects across the app
 * without a refresh.
 *
 * The CSS that consumes these lives in `index.css` under
 * `html[data-density="..."]`, `html[data-cb-safe="true"]`, etc.
 */
export default function useDisplaySettings() {
  useEffect(() => {
    const apply = (s) => {
      if (typeof document === 'undefined') return
      const root = document.documentElement

      // UI density → CSS variable used by `index.css` to adjust padding/gap.
      root.setAttribute('data-density', s.uiDensity || 'comfortable')

      // Font scale → CSS variable; consumer multiplies its base font-size.
      const scale = Number(s.fontScale) || 1
      root.style.setProperty('--font-scale', String(scale))

      // Reduce motion → CSS attribute; index.css already honors
      // prefers-reduced-motion, but this lets users force it on regardless
      // of OS setting.
      root.setAttribute('data-reduce-motion', s.reduceMotion ? 'true' : 'false')

      // Color-blind-safe palette → CSS attribute; consumer swaps a small
      // set of semantic tokens.
      root.setAttribute('data-cb-safe', s.colorBlindSafePalette ? 'true' : 'false')
    }

    // Apply once on mount, then re-apply whenever any display setting changes.
    apply(useSettingsStore.getState())
    const unsub = useSettingsStore.subscribe((state) => apply(state))
    return unsub
  }, [])
}
