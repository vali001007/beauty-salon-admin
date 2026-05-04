import { useEffect, useState } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { useStoreStore } from '@/stores/storeStore'
import { LoginPage } from './components/LoginPage'
import { ChatInterface } from './components/ChatInterface'

type AppRole = 'receptionist' | 'manager' | 'beautician'

export default function App() {
  const { isAuthenticated, user, logout } = useAuthStore()
  const { loadStores, setCurrentStore } = useStoreStore()
  const [appRole, setAppRole] = useState<AppRole | null>(null)

  useEffect(() => {
    if (isAuthenticated) {
      loadStores().then(() => {
        const stores = useStoreStore.getState().stores
        if (stores.length > 0 && !useStoreStore.getState().currentStoreId) {
          setCurrentStore(stores[0].id)
        }
      })
    }
  }, [isAuthenticated, loadStores, setCurrentStore])

  if (!isAuthenticated || !user || !appRole) {
    return (
      <LoginPage
        onLogin={(role) => setAppRole(role)}
      />
    )
  }

  return (
    <ChatInterface
      user={{ name: user.name, role: appRole }}
      onLogout={() => {
        logout()
        setAppRole(null)
      }}
    />
  )
}
