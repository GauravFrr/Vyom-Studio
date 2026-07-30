import { createContext, useContext } from 'react'

const HomeIntroContext = createContext({ animated: false })

export function HomeIntroProvider({ animated, children }) {
  return (
    <HomeIntroContext.Provider value={{ animated }}>
      {children}
    </HomeIntroContext.Provider>
  )
}

export function useHomeIntroContext() {
  return useContext(HomeIntroContext)
}
