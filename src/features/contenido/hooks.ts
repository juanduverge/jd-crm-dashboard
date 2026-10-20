import { useContext, useEffect, useRef, useState } from 'react'
import { UNSAFE_NavigationContext } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { cmsService } from '@/services/cmsService'

export function useCmsTypes() { return useQuery({ queryKey: ['cms', 'types'], queryFn: cmsService.types }) }
export function useCmsGroup(id: string) { return useQuery({ queryKey: ['cms', 'group', id], queryFn: () => cmsService.group(id), enabled: !!id }) }
export function useCmsItem(id: string) { return useQuery({ queryKey: ['cms', 'item', id], queryFn: () => cmsService.item(id), enabled: !!id }) }
export function useDebounced<T>(value: T, delay = 400) {
  const [settled, setSettled] = useState(value)
  useEffect(() => { const timer = window.setTimeout(() => setSettled(value), delay); return () => window.clearTimeout(timer) }, [value, delay])
  return settled
}

// BrowserRouter no admite useBlocker. Interceptamos sus navegaciones y restauramos
// el índice de historial si se cancela Atrás/Adelante, sin desmontar el formulario.
export function useUnsavedChanges(dirty: boolean) {
  const { navigator } = useContext(UNSAFE_NavigationContext)
  const dirtyRef = useRef(dirty)
  const [pending, setPending] = useState<{ run: () => void } | null>(null)
  dirtyRef.current = dirty
  useEffect(() => {
    const originalPush = navigator.push
    const originalReplace = navigator.replace
    let index: number = window.history.state?.idx ?? 0
    let restoring = false
    let approvedPop = false
    const request = (run: () => void) => { if (dirtyRef.current) setPending({ run }); else run() }
    const push: typeof navigator.push = (...args) => request(() => { originalPush.apply(navigator, args); index = window.history.state?.idx ?? index })
    const replace: typeof navigator.replace = (...args) => request(() => { originalReplace.apply(navigator, args); index = window.history.state?.idx ?? index })
    navigator.push = push
    navigator.replace = replace
    const unload = (event: BeforeUnloadEvent) => { if (dirtyRef.current) { event.preventDefault(); event.returnValue = '' } }
    const pop = (event: PopStateEvent) => {
      if (restoring) { restoring = false; event.stopImmediatePropagation(); return }
      const next: number | undefined = event.state?.idx
      if (next === undefined || next === index) return
      if (approvedPop) { approvedPop = false; index = next; return }
      if (dirtyRef.current) {
        event.stopImmediatePropagation()
        restoring = true
        window.history.go(index - next)
        setPending({ run: () => { approvedPop = true; window.history.go(next - index) } })
      } else index = next
    }
    window.addEventListener('beforeunload', unload)
    window.addEventListener('popstate', pop, true)
    return () => {
      if (navigator.push === push) navigator.push = originalPush
      if (navigator.replace === replace) navigator.replace = originalReplace
      window.removeEventListener('beforeunload', unload)
      window.removeEventListener('popstate', pop, true)
    }
  }, [navigator])
  return { open: !!pending, cancel: () => setPending(null), proceed: () => { const action = pending; setPending(null); action?.run() } }
}
