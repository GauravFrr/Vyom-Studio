import { create } from 'zustand'

const useAuthStore = create((set) => ({
  user: null,
  authChecked: false,
  /** One-shot flag: play the home entry animation after login/register. */
  welcomeIntro: false,
  setAuth: (user, opts = {}) =>
    set({
      user,
      authChecked: true,
      welcomeIntro: Boolean(opts.welcomeIntro),
    }),
  clearWelcomeIntro: () => set({ welcomeIntro: false }),
  logout: () => set({ user: null, authChecked: true, welcomeIntro: false }),
  setAuthChecked: () => set({ authChecked: true }),
}))

export default useAuthStore
