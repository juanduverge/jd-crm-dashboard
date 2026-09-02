import { Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Sidebar, MobileNav } from './Sidebar'
import { Topbar } from './Topbar'
import { CommandPalette } from './CommandPalette'
import { FollowUpsBanner } from './FollowUpsBanner'

export function AppLayout() {
  const location = useLocation()
  return (
    <div className="flex min-h-dvh bg-bg">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        {/* `pb` generoso abajo: en el móvil la barra de gestos se come la
            última fila si el contenido termina justo en el borde. */}
        <main className="flex-1 px-3 pb-[calc(2rem+var(--safe-bottom))] pt-4 sm:px-4 sm:py-5 md:px-6 lg:px-8">
          {/* Fuera de AnimatePresence: el aviso no debe re-animarse en cada
              cambio de ruta, tiene que sentirse persistente hasta atenderlo. */}
          <FollowUpsBanner />
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="mx-auto max-w-[1500px]"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <MobileNav />
      <CommandPalette />
    </div>
  )
}
