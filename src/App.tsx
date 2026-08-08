import NeonPathGame from './routes/index'
import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { Toaster } from 'sonner'

function App() {
  console.log("App: Launching Neon Path v1.0");

  useEffect(() => {
    // Initialize Edge-to-Edge for Neon Path
    if (Capacitor.isNativePlatform()) {
      import('@capawesome/capacitor-android-edge-to-edge-support').then(({ EdgeToEdge }) => {
        EdgeToEdge.setBackgroundColor({ color: '#00000000' }).catch(err => console.error("EdgeToEdge failed", err));
      }).catch(err => console.error("EdgeToEdge import failed", err));
    }
  }, []);

  return (
    <>
      <NeonPathGame />
      <Toaster position="top-center" richColors theme="dark" />
    </>
  )
}

export default App
