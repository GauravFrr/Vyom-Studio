import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { Toaster } from './components/ui/Toast.jsx'
import { SidebarProvider } from './context/SidebarContext.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <SidebarProvider>
      <Toaster>
        <App />
      </Toaster>
    </SidebarProvider>
  </React.StrictMode>,
)
