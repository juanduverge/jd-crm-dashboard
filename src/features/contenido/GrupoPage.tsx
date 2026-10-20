import { Navigate, useParams } from 'react-router-dom'
import { ContentError, LoadingContent } from './components'
import { useCmsGroup } from './hooks'

/**
 * Ruta antigua de la ficha de grupo. El cambio de idioma (EN | ES) y los datos
 * de la pieza viven ahora en el editor, así que solo redirige a su primera
 * versión: los enlaces que ya existan siguen funcionando.
 */
export default function GrupoPage() {
  const { groupId = '' } = useParams()
  const group = useCmsGroup(groupId)
  if (group.isLoading) return <LoadingContent />
  if (group.isError) return <ContentError retry={() => void group.refetch()} />
  const first = group.data?.items.find(i => i.lang === 'en') ?? group.data?.items[0]
  return <Navigate replace to={first ? `/contenido/item/${first.id}` : '/contenido'} />
}
